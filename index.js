#!/usr/bin/env node

var fs = require( "fs" );
var readline = require( "readline" );
var Repo = require( "git-tools" );
var colors = require( "colors" );
var minimist = require( "minimist" );

// Parse arguments
var args = minimist( process.argv.slice( 2 ), {
	alias: {
		f: "file",
		p: "pattern",
		C: "context",
		c: "committish",
		e: "regexp"
	}
});
var path = args.file || args._.pop();
var rawPattern = args.pattern || args._.pop();
var useRegexp = args.regexp || false;
var committish = args.committish || "HEAD";
var initialContext = args.context || 4;

// Determine pattern
if ( typeof rawPattern !== "string" ) {
	rawPattern = "";
}
if ( !useRegexp ) {
	rawPattern = rawPattern.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1" );
} else if ( typeof useRegexp === "string" ) {
	rawPattern = useRegexp;
}
var pattern = new RegExp( rawPattern );

// Check for required arguments
if ( !path || pattern.source === "(?:)" ) {
	console.log( "\n" + fs.readFileSync( __dirname + "/usage.txt", "utf-8" ) );
	process.exit( 1 );
}

var rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout
});
var repo = new Repo( "." );
var actionPrompt = "Next action [r,n,p,c,d,q,?]?";
var isFirst = true;
var walking = false;

process.stdin.setEncoding( "utf8" );

function prompt( message, fn ) {
	rl.question( message + " ", function( answer ) {
		rl.pause();
		fn( null, answer );
	});
}

function blame( options, callback ) {
	var context = initialContext;
	repo.blame( options, function( error, blame ) {
		if ( error ) {
			return callback( error );
		}

		var patternIndex = 0;
		var patternMatches = blame.filter(function( line ) {
			return pattern.test( line.content );
		});

		if ( !patternMatches.length ) {
			return callback( null, null );
		}

		function doAction( error, action ) {
			if ( error ) {
				return callback( error );
			}

			if ( action === "q" ) {
				process.exit();
			}

			if ( action === "r" ) {
				return callback( null, patternMatches[ patternIndex ] );
			}

			if ( action === "n" ) {
				if ( patternIndex === patternMatches.length - 1 ) {
					console.log( "No more matches." );
					return prompt( actionPrompt, doAction );
				}

				patternIndex++;
				return show();
			}

			if ( action === "p" ) {
				if ( patternIndex === 0 ) {
					console.log( "No previous matches." );
					return prompt( actionPrompt, doAction );
				}

				patternIndex--;
				return show();
			}

			if ( action === "c" ) {
				context = Math.ceil( context * 1.5 );
				return show();
			}

			if ( action === "d" ) {
				return showDiff({
					commit: patternMatches[ patternIndex ].commit,
					path: patternMatches[ patternIndex ].path
				}, function( error ) {
					if ( error ) {
						return callback( error );
					}

					prompt( actionPrompt, doAction );
				});
			}

			showHelp();
			show();
		}

		function show() {
			if ( isFirst && walking ) {
				isFirst = false;
				return repo.resolveCommittish( options.committish.slice( 0, -1 ), function( error, sha ) {
					if ( error ) {
						console.log( error );
						return;
					}

					console.log( "\n\nPattern removed in " + sha.red );
					show();
				});
			}

			showPatternMatch({
				full: blame,
				patternMatches: patternMatches,
				patternIndex: patternIndex,
				path: options.path,
				context: context
			}, doAction );
		}

		show();
	});
}

function showHelp() {
	console.log( "r - recurse; view previous revision" );
	console.log( "n - view next match in current revision" );
	console.log( "p - view previous match in current revision" );
	console.log( "c - increase context" );
	console.log( "d - view diff for current revision" );
	console.log( "q - quit" );
	console.log( "? - show help" );
}

function showPatternMatch( blame, callback ) {
	var totalLines = blame.full.length;
	var patternIndex = blame.patternIndex + 1;
	var patternCount = blame.patternMatches.length;
	var line = blame.patternMatches[ blame.patternIndex ];
	var context = blame.context;
	var format =
		"Commit: %C(yellow)%H%Creset\n" +
		"Author: %aN <%aE>\n" +
		"Date:   %cd (%cr)\n" +
		"Path:   " + blame.path + "\n" +
		"Match:  " + patternIndex + " of " + patternCount + "\n" +
		"\n" +
		"    %s\n";

	repo.exec( "log", "--pretty=" + format, "-1", line.commit, function( error, commitInfo ) {
		if ( error ) {
			return callback( error );
		}

		console.log( "\n" + commitInfo + "\n" );

		var lineOutput;
		for ( var i = Math.max( 0, line.lineNumber - context - 1 );
				i < Math.min( totalLines, line.lineNumber + context );
				i++ ) {
			// TODO: padding for line numbers
			lineOutput = blame.full[ i ].lineNumber + ") " + blame.full[ i ].content;
			if ( i === line.lineNumber - 1 ) {
				lineOutput = lineOutput.cyan;
			}
			console.log( lineOutput );
		}

		console.log( "" );
		prompt( actionPrompt, callback );
	});
}

function showDiff( options, callback ) {
	repo.exec( "diff", "--color", options.commit + "^.." + options.commit, "--", options.path, function( error, diff ) {
		if ( error ) {
			return callback( error );
		}

		console.log( diff );
		callback( null );
	});
}

function recur( options ) {
	blame( options, function( error, line ) {
		if ( error ) {
			console.log( error );
			return;
		}

		if ( !line ) {
			if ( !isFirst ) {
				console.log( "No matches. Recursive blame complete." );
				return;
			}

			if ( walking ) {
				process.stdout.write( new Array( walking.toString().length + 1 ).join( "\b" ) );
				process.stdout.write( "" + (++walking) );

				return recur({
					path: options.path,
					committish: options.committish + "^"
				});
			}

			return prompt( "No matches found. Walk through previous revisions?", function( error, action ) {
				if ( error ) {
					console.log( error );
					return;
				}

				if ( action !== "y" ) {
					return;
				}

				walking = 1;
				process.stdout.write( "Walking revisions: " + walking );

				recur({
					path: options.path,
					committish: options.committish + "^"
				});
			});
		}

		isFirst = false;
		recur({
			path: line.path,
			committish: line.commit + "^"
		});
	});
}

recur({
	path: path,
	committish: committish
});
