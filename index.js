#!/usr/bin/env node

var Repo = require( "git-tools" );
var colors = require( "colors" );

// TODO: option parser
var path = process.argv[ 2 ];
var pattern = new RegExp( process.argv[ 3 ] );
var committish = "HEAD";
var _context = 4;
var repo = new Repo( "." );

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

		var patternMatches = blame.filter(function( line ) {
			return pattern.test( line.content );
		});

		if ( !patternMatches.length ) {
			return callback( null, null );
		}

		// TODO: loop over matches
		var line = patternMatches[ 0 ];
		function doAction( error, action ) {
			if ( error ) {
				return callback( error );
			}

			if ( action === "n" ) {
				return callback( null, null );
			}

			if ( action === "y" ) {
				return callback( null, line );
			}

			if ( action === "c" ) {
				context = Math.ceil( context * 1.5 );
				return show();
			}

			if ( action === "d" ) {
				return showDiff({
					commit: line.commit,
					path: line.path
				}, function( error ) {
					if ( error ) {
						return callback( error );
					}

					prompt( "View previous revision [y,n,c,d,?]?", doAction );
				});
			}

			showHelp();
			show();
		}

		function show() {
			showPatternMatch({
				full: blame,
				line: line,
				path: options.path,
				context: context
			}, doAction );
		}

		show();
	});
}

function showHelp() {
	console.log( "y - view previous revision" );
	console.log( "n - quit; do not view previous revision" );
	console.log( "c - increase context" );
	console.log( "d - view diff for current revision" );
	console.log( "? - show help" );
}

function showPatternMatch( blame, callback ) {
	var totalLines = blame.full.length;
	var line = blame.line;
	var context = blame.context;
	var format =
		"Commit: %C(yellow)%H%Creset\n" +
		"Author: %aN <%aE>\n" +
		"Date:   %cd (%cr)\n" +
		"Path:   " + blame.path + "\n" +
		"\n" +
		"    %s\n";

	// TODO: add author info
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
		prompt( "View previous revision [y,n,c,d,?]?", callback );
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
			console.log( "Recursive blame complete." );
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
