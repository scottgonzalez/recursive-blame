#!/usr/bin/env node

var Repo = require( "git-tools" );
var colors = require( "colors" );

// TODO: option parser
var path = process.argv[ 2 ];
var pattern = new RegExp( process.argv[ 3 ] );
var committish = "HEAD";
var _context = 4;
var repo = new Repo( "." );

var actionPrompt = "Next action [r,n,p,c,d,q,?]?";

process.stdin.setEncoding( "utf8" );

function prompt( message, fn ) {
	process.stdout.write( message + " " );
	process.stdin.resume();

	process.stdin.once( "data", function( chunk ) {
		process.stdin.pause();
		fn( null, chunk.trim() );
	});
}

function blame( options, callback ) {
	var context = _context;
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
		}

		if ( !line ) {
			console.log( "No matches. Recursive blame complete." );
			return;
		}

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
