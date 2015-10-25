var audiobox_model = function(sqlite3,io) {
	console.log('./db/mixxxdb.sqlite');
	var mythis = this;		//So I can get at the db.
	var db = new sqlite3.Database('./db/mixxxdb.sqlite',sqlite3.OPEN_READWRITE);
	mythis.audioboxId;			//This is the 'current' playlist id
	mythis.nextSongIdx=0;		//The index to the next song to play in songIdList
	mythis.songPlaying=["*",""];	//[0]=current playing status (*=never started, r=running, p=paused)
										//[10=songId of currently playing song
	mythis.songIdListCnt=0;		//The number of songs in the current playlist
	mythis.songIdList=[0];		//The PlaylistId_TrackIds for the songs to play, in play order
								//NOTE: sqlite reuses a id of deleted rows.  So if we delete & add a playlist
								//      PlaylistId might not be unique if we change/replace the playlist while something is playing
	var myio=io;				//So I can send stuff back to the browser
	
	//Gets the 'current' playlist id (creates it if necessary)
	getAudioboxId = function (callback) {
		var sql='SELECT id FROM Playlists WHERE name="AUDIOBOX CURRENT"';
		db.get(sql,{},function(err, row) {
			if (typeof row != 'undefined') {
				mythis.audioboxId=row.id;
				console.log('Current Playlist ID: '+mythis.audioboxId);
				callback();
			} else {
				//For now. we will just kill NODE if this doesn't exist.  Eventually, we should create this playlist when we
				// initially create the tables.
				console.log('AUDIOBOX CURRENT does not exist');
				process.exit(100);
				//mythis.createPlaylist('AUDIOBOX CURRENT',2,getAudioboxId);
			}
		});
	}
	
	//Handle the model initialization - then do a callback when complete
	modelInit = function(callback) {
		//Make sure we have the id defined
		getAudioboxId(function() {
			//We also need to get the list of tracks in case LiquidSoap is already playing something
			sql='SELECT id, track_id FROM PlaylistTracks WHERE playlist_id=? ORDER BY position';
			db.all(sql,mythis.audioboxId, function(err,rows) {
				mythis.saveSongIds(rows);			//Save all the Ids
				mythis.setNextSongIdx("*");			//Set to beginning of list
				callback();
			});
		});
	}
	
	//When the browser wants to play a song locally, we need to full location
	getTrackFileLocation=function(thisTrack,callback) {
    	var sql="SELECT tl.location FROM library AS lib LEFT JOIN track_locations AS tl ON lib.location=tl.id WHERE lib.id=?";
			db.get(sql,thisTrack, function(err,row) {
				if (typeof row != 'undefined') {
    			var filename=row.location.replace("D:/RealMusic/","/mnt/remotemusic/");
				callback(filename);
			} else {
				console.log('Missing Track Location: '+thisTrack);
			}
		});
	}
	
	//Skip - we need to '+' or '-' the nextSongIdx
	skipSong=function(direction) {
		if (mythis.songIdListCnt<2 || direction=='+') {
			//Forward/backward doesn't make any difference if we only have 0 or 1 entries
			//And forward doesn't require any changes from us.  'next' is already set.
			return;
		}
		//We subtract 2 because it is 'next' song.. if we did 1, then we would be back to the currently playing song
		mythis.nextSongIdx=mythis.nextSongIdx-2;
		if (mythis.nextSongIdx<0) {
			mythis.nextSongIdx=mythis.songIdListCnt-mythis.nextSongIdx;
		}
	}
	
	//Store the songIds into the songIdList array
	saveSongIds=function(rows) {
		var i;
		mythis.songIdListCnt=rows.length;
		mythis.songIdList=[];
		for (i=0; i<mythis.songIdListCnt; i++) {
				mythis.songIdList.push(mythis.getSongId(rows[i]));
		}
		console.log("Loaded songIdList:"+mythis.songIdListCnt);
	}
	
	//Find and set the next song we want to play from the songIdList
	// requestPlid is the last songId that we gave LiquidSoap to prepare (might be different than what is playing)
	setNextSongIdx=function(requestedPlid) {
		var ridx=requestedPlid.replace(/"/g, "");		//Was just to complicated to drop the quotes in LiquidSoap
		ridx=songIdList.indexOf(ridx);
		if (ridx<0) {
			//We turned a song over to LiquidSoap, but can't find it in the current playlist
			//This could occur if we swapped playlists, or deleted an entry.
			mythis.nextSongIdx=0;		//Reset this to the beginning
		} else {
			//We found it.. so 'next' is really that one +1
			mythis.nextSongIdx=ridx+1;
			//Reset back to start if we sent it the last one
			if (mythis.nextSongIdx>=mythis.songIdListCnt) {
				mythis.nextSongIdx=0;
			}
		}
	}	
	
	//Sets the current song information
	setSongPlaying = function(status, playingSongId) {
		mythis.songPlaying=[status,playingSongId];
	}
	
	//Returns the current playing status
	getSongPlaying = function() {
		return mythis.songPlaying;
	}
		
	//This is a helper routine to return the 'unique' songId - so I only need to change it one place...
	getSongId= function(arow) {
		return arow.id+"z"+arow.track_id;
	}
	
	//Change the rating on the song
	ratingChanged=function(request) {
		var sql="UPDATE Library SET rating=? WHERE id=?";
		db.run(sql,[request.rating,request.id],function(result) {
			console.log("Rating Update: "+this.changes);
		});
	}
	
	//Change the crates a song is in
	cratesChanged=function(request) {
		//So, the first thing we need to do is determine where it is currently referenced.
	    var track_id=request.shift();			//The track_id is the first entry in the array, then the crate id's that were selected
	    var sql="SELECT id FROM crate_tracks LEFT JOIN crates ON id=crate_id WHERE track_id=?";
	    db.all(sql,[track_id],function(err,rows) {
	    	console.log(rows);
	    	//If it is in the new set, and the old set, then we don't need to do anything.
	    	//If it is in the old only, we need to delete it from crate_tracks and decrement the count in crates.
	    	//If it is in the new set only, we need to add it to crate_tracks, and add to the count in crates.
	    	var i;
	    	var idx;
	    	var cnt=rows.length;
	    	//Loop through all the ones it is currently in
	    	for (i=0; i<cnt; i++) {
	    		//See if it is present in both the selected list, and the current list
	    		console.log("i: "+i+" rows[i]: "+rows[i]);
	    		idx=request.indexOf(rows[i].id);
	    		if (idx<0) {
	    			//No.. it WAS present, but was NOT selected
	    			//We need to delete it from the crate_tracks, and decrement the count in crates.
	    			sql="DELETE FROM crate_tracks WHERE crate_id=? AND track_id=?";
	    			db.run(sql,[rows[i].id,track_id],function(result) {
	    				console.log("Crate Track Delete: "+this.changes+" @ "+track_id);
	    			});
	    			sql="UPDATE crates SET count=count-1 WHERE id=?";
	    			db.run(sql,[rows[i].id],function(result) {
	    				console.log("Crate Decrement: "+this.changes+" @ "+track_id);
	    			});
	    			//We don't need to remove it from request, since it wasn't in there.
	    		} else {
	    			//It is in both places, so all we need to do is remove it from request as we have 'handled' it
	    			request.splice(idx,1);
	    		}	    			
	    	}
	    	//Anything left in request has to be added
	    	cnt=request.length;
	    	for (i=0; i<cnt; i++) {
	    		//Insert it into the tracks table
	    		sql="INSERT INTO crate_tracks (crate_id, track_id) VALUES (?,?)";
	    		db.run(sql,[request[i],track_id],function(result) {
	    			console.log("Crate Track Insert: "+this.lastID+" @ "+track_id);
	    		});
	    		//And increment the count of how many there are.
	    		sql="UPDATE crates SET count=count+1 WHERE id=?";
	    		db.run(sql,[request[i]],function(result) {
	    			console.log("Crate Increment: "+this.changes+" @ "+track_id);
	    		});
	    	}
	    });
	}
	
	//Simply get a complete list of all the crates available.
	getCratesList= function(request) {
		var soi=myio;
		var sql="SELECT id, name FROM crates ORDER BY name";
		db.all(sql,{},function(err,rows) {
			var crates=Array();
			var i;
			var rl=rows.length;
			for (i=0; i<rl; i++) {
				acrate=Array(rows[i].id, rows[i].name);
				crates.push(acrate);				
			}
			soi.emit(request.event,JSON.stringify(crates));
		});
	}
		
    //Once we get told Liquidsoap has started the song, we need to tell the browser that it has started, then adjust the playlist
    //NOTE: theSonsId contains both the playlist track id and the track id.  The song MIGHT not be in the playlist track id.
    //      so we only rely on the track id.
    //      ALSO.. if request.remaining >0, then we will use that instead of from the track table because the song has already started
	getSongStarted = function(request) {
		var soi=myio;
		var lines=mythis.songPlaying[1].split('z');		//We use the track_id, not the playlisttrack id
 		var sql="SELECT title, printf('%d:%02d',(duration/60),(duration%60)) AS ftime, duration, id AS track_id, rating, artist FROM library WHERE id=?";   	
		db.get(sql,lines[1],function(err, row) {
			if (row=='undefined') {
				console.log("In songStarted, but not in playlist.");
				return;
			}
    		console.log("Now Playing: "+row.title);
    		//See if we are already part way into the song
    		if (request.remaining>0) {
    			row.duration=request.remaining;
    			//Format the time also
    			var hh=Math.floor(row.duration/3600);		//Hour part
				var ss=row.duration-hh*3600;
				var mm=Math.floor(ss/60);
				ss=ss-mm*60;
				if (mm<10) {
					mm='0'+mm;
				}
				if (ss<10) {
					ss='0'+ss;
				}
				//return hh only if necessary
				if (hh>0) {
					row.ftime=hh+':'+mm+':'+ss;
				} else {
				 row.ftime= mm+':'+ss;
				}    			
    		}
    		//Tell the browser to start showing that the song is playing.
    		row.songId=mythis.songPlaying[1];
    		row.playerStatus=mythis.songPlaying[0];
			soi.emit(request.songevent,JSON.stringify(row));
    	});
		//And we need to tell the browser what crates this song is currently in (we don't are about the order - we did that when we gave the list
		//We don't need to wait for this to return.
		mythis.getSongCrates({track_id:lines[1], crateevent:request.crateevent});
	}
	
	//When we get new information from LiquidSoap that it started a new song
	setSongStarted = function (theSongId) {
		mythis.songPlaying[0]='r';		//Since this comes via the notice from LiquidSoap, it must be running
		mythis.songPlaying[1]=theSongId;
		//I don't need to worry about exactly when this gets completed.
    	sql="UPDATE library SET timesplayed=timesplayed+1 WHERE id=?";
    	db.run(sql,[row.track_id],function(result) {
    		console.log("Timesplayed Done: "+this.changes);
    	});
	}
	//Get the crates that a song is in.
	getSongCrates = function (request) {
		var soi=myio;
	    sql="SELECT id FROM crate_tracks LEFT JOIN crates ON id=crate_id WHERE track_id=?";
	    db.all(sql,[request.track_id],function(err,rows) {
	    	//The first entry is the track id
			var crates=[request.track_id];
			var i;
			var rl=rows.length;
			for (i=0; i<rl; i++) {
				crates.push(rows[i].id);
			}
			console.log("Crates Done: "+JSON.stringify(crates));
			soi.emit(request.crateevent,JSON.stringify(crates));
	    });
	}
	//We want to update the current playlist (either by moving a song within it, or dropping a new song into it
    updatePlaylist= function(request) {
    	//request=beforethis,movethis,dothistype,event
    	var sql;
    	var param;
    	if (request.beforethis=='atEnd') {
    		//If we want to move it 'before the end', we need to find the current max position (which might be NULL if the list is empty)
    		sql="SELECT MAX(position) AS position FROM PlaylistTracks WHERE playlist_id=?";
    		param=mythis.audioboxId;
    	} else {    	
    		//Otherwise, we are going to need the position of where we are moving to
	    	sql="SELECT position FROM PlaylistTracks WHERE id=?";
	    	param=request.beforethis;
		}
		db.get(sql,param,function(err, row) {
			var before=0;				//If we don't have anything in the table, then the row will be undefined and we start at 0
			if (typeof row != 'undefined' && row.position!=null) {
				before=parseInt(row.position);	//Otherwise, this will be where we want to insert the row 'before'
			}
			console.log(row);
			console.log(before);
			if (request.dothistype=='s') {
				var sql;
				//We are inserting from another list (either from search, so from a playlist review)
				db.serialize(function () {
					if (request.beforethis=='atEnd') {
						//If we are inserting at the end, we need to bump before, because it is 'max'
						before++;
					} else {
						//If we aren't inserting at the end, we need to slide everything 'down'
						//sql="UPDATE PlaylistTracks SET position=position+1 WHERE playlist_id={$this->currentID} AND position>=$before";
						sql="UPDATE PlaylistTracks SET position=position+1 WHERE playlist_id=? AND position>=?";
						db.run(sql,[mythis.audioboxId,before],function(res) {
							console.log("S - After positions update:"+this.changes);						
						});
					}				
					//sql="INSERT INTO PlaylistTracks (playlist_id, track_id, position) VALUES ({$this->currentID}, $movethis, $before)"												
					var sql="INSERT INTO PlaylistTracks (playlist_id, track_id, position) VALUES (?, ?, ?)";
					db.run(sql,[mythis.audioboxId,request.movethis,before],function (res) {
						console.log("S - After insert item:"+this.lastID);
						mythis.getCurrentPlaylist(request);
					});							
				});
			} else {
				//If we are moving within the list, we need to know the position of the one we are moving
	    		var sql="SELECT position FROM PlaylistTracks WHERE id=?";
	    		db.get(sql,request.movethis, function (err, row) {
	    			var move=parseInt(row.position);
	    			console.log('Moving ID: '+move);
					//Run the two updates in serial
					db.serialize(function() {
		    			var sql;
		    			var parm
						if (request.beforethis=='atEnd') {
							//If we are adding to the end, then we need to move everything 'up'
							sql="UPDATE PlaylistTracks SET position=position-1 WHERE position>? AND playlist_id=?";
							parm=[move,mythis.audioboxId];
						} else if (before<move) {
							//We are moving 'up', so we need to move everything 'down' to make room
							sql="UPDATE PlaylistTracks SET position=position+1 WHERE position >=? AND position<? AND playlist_id=?";
							parm=[before,move,mythis.audioboxId];
						} else {
							//We are moving 'down', so we need to slide everything up to make room
							sql="UPDATE PlaylistTracks SET position=position-1 WHERE position >? AND position<? AND playlist_id=?";
							parm=[move,before,mythis.audioboxId];
							//NOTE: We decrement before AFTER we create the parms, because it will now be what we want to make the new entry
							before--;
						}
						//First the one to adjust the other entries	
						db.run(sql,parm,function(res) {
							console.log("P - After positions update:"+this.changes);						
						});
						//And we always need to update the position of the one we are moving
						var sql="UPDATE PlaylistTracks SET position=? WHERE id=?";
						db.run(sql,[before,request.movethis],function(res) {
							console.log("P - After update moved item:"+this.changes);
							mythis.getCurrentPlaylist(request);							
						});
					});
	    		});
			}
		});
	}
	
	//This is just a simple function to convert the object that SQLITE returns to an array so send back to the browser
	tracksobj2array=function(tracks) {
		//We want to convert from an object to a simple array to avoid shipping a lot of extra characters for each track
		var rtn=Array();
		var tl=tracks.length;
		var atrack;
		var arow;
		for (i=0; i<tl; i++) {
			atrack=tracks[i];
			arow=Array();
			arow[0]=atrack.id;
			arow[1]=atrack.artist;
			arow[2]=atrack.album;
			arow[3]=atrack.title;
			arow[4]=atrack.ftime;
			arow[5]=atrack.position;
			arow[6]=atrack.name;
			arow[7]=atrack.track_id;
			arow[8]=atrack.duration;
			arow[9]=mythis.getSongId(atrack);
			rtn.push(arow);
		}
		return rtn;
	}
	//Perform the search of the database for the requested type (song, artist, album)
	doSearch = function(request) {
    	var soi=myio;
    	var histhis=mythis;
		var fullterm=request.term.trim();
		var words=fullterm.split(" ");			//Individual words (space separator)
		if (words.length==0 || fullterm.length==0) {
			//Just return an empty list
		}
    	//NOTE: we 'fudge' up a select list which looks close to the one we get from a playlist so we can handle them
	    var sql="SELECT 0 AS id, artist, album, title, printf('%d:%02d',(duration/60),(duration%60)) AS ftime, 0 AS position, 'Search' AS name, library.id AS track_id, duration FROM library WHERE ";
	    //We first query for the full term in the field, then we will do the individual words
	    db.all(sql+request.type+" LIKE ? ORDER BY "+request.type,["%"+fullterm+"%"],function (err, fulllist) {
    		var skipthese=['and','the'];			//Don't bother looking for these, or anything <3 characters
			var i;
			var l=words.length;
			var searchterms=[];	
			var whereparts=[];
			var likemodel="("+request.type+" LIKE ? )";			//We will need one of these for each word.
			for (i=0; i<l; i++) {
				var theword=words[i];
				//Make sure it is >3 characters, not in the automatically skip list, and not already in the search list
				if (theword.length>3 && skipthese.indexOf(theword)<0 && searchterms.indexOf(theword)<0) {
					searchterms.push(theword);
					whereparts.push(likemodel);
				}
			}
			//AFTER we collect them, then we need to put the wild cards around them (otherwise, we can't check for dupes above
			l=searchterms.length;
			for (i=0; i<l; i++) {
				searchterms[i]="%"+searchterms[i]+"%";
			}
			l=200-fulllist.length;				//We really only want to return 200 max.
			//We should check to see if searchterms has zero or one entry, and not bother if so.
			db.all(sql+whereparts.join(" AND ")+" ORDER BY "+request.type+" LIMIT "+l,searchterms,function (err, termslist) {
				var rtn=histhis.tracksobj2array(fulllist);
				rtn=rtn.concat(histhis.tracksobj2array(termslist));
				//NOTE: Someday, we might want to remove duplicates from termslist that are already in fulllist
				soi.emit(request.event,JSON.stringify(rtn));
			});
	    });
	}	
	//Save the 'current' playlist to the named playlist (creating if necessary).
	//NOTE: we don't send anything back to the browser, since nothing has really changes
	saveCurrentList = function(request) {
		var sql='SELECT id,name FROM Playlists WHERE name=?';
		db.get(sql,[request.name],function(err,row) {
			if (typeof row != 'undefined') {
				//It already exists, we will just delete all and copy over
				mythis.copyCurrent(row.id);
			} else {
				//We need to create it before we delete/copy
				mythis.createPlaylist(thename,0,copyCurrent);
			}
		});
	}
	//Once we have the ID we want to copy TO, then we can delete everything from there, and 
	// copy everything over
	copyCurrent = function(toid) {
    	var hisdb=db;
		db.serialize(function() {
			//First we delete all the track from the 'to' list
			var sql='DELETE FROM PlaylistTracks WHERE playlist_id=?';
			hisdb.run(sql,[toid]);
			sql='INSERT INTO PlaylistTracks (playlist_id, track_id, position) SELECT ?,track_id, position FROM PlaylistTracks WHERE playlist_id=?';
			hisdb.run(sql,[toid,mythis.audioboxId]);
			console.log('Copied from: '+mythis.audioboxId+' to: '+toid);
		});
	}
	//Replace the 'current' playlist with the tracks from the selected playlist
	replaceCurrentList= function(request) {    	
    	//Serialize the delete and insert to simplify the callback
    	var hisdb=db;
    	db.serialize(function() {
			var theid=request.withID;
			//Clear out all the tracks from the 'current' playlist
			sql="DELETE FROM PlaylistTracks WHERE playlist_id=?";
			hisdb.run(sql,mythis.audioboxId);
			//Get the tracks and positions from the requested playlist and insert them into the AUDIOBOX playlist
    		sql='INSERT INTO PlaylistTracks (playlist_id, track_id, position) SELECT '+
    			mythis.audioboxId+
    			',plt.track_id, plt.position FROM PlaylistTracks AS plt LEFT JOIN Playlists AS pl ON plt.playlist_id=pl.id WHERE pl.id=?';
    		hisdb.run(sql, theid, function(result) {
				mythis.getCurrentPlaylist(request);
				mythis.nextSongIdx=0;			//Reset this back to the first song.
    		});
    	});
	}
	//Getting a playlist to review it instead of making it the 'current' playlist
	getForReview= function(request) {
		this.getPlaylistTracks(request.plid, request.event);
	}
	
	//Get the list of tracks in the requested playlist Id
	getPlaylistTracks= function(theplid,request) {		
    	sql="SELECT  plt.id, l.artist, l.album, l.title, printf('%d:%02d',(l.duration/60),(l.duration%60)) AS ftime, plt.position, pl.name, plt.track_id, l.duration FROM library AS l LEFT JOIN PlaylistTracks AS plt ON plt.track_id=l.id LEFT JOIN Playlists AS pl ON plt.playlist_id=pl.id WHERE pl.id=? ORDER BY plt.position, plt.id";
    	var soi=myio;
    	var i;
		db.all(sql,[theplid],function (err, tracks) {
			//It is an 'error' if anything other than the current playlist is empty
	 		if (tracks.length==0 && theplid!=mythis.audioboxId) {
				soi.emit(request.event,'{"errormsg":"No tracks in: playlist"}');
				console.log("No tracks in playlist: "+theplid);
				return;
			}
			if (theplid==mythis.audioboxId && request.type!="simple") {
				//If this is the 'AUDIOBOX' playlist, we want to update the information about the tracks in it.
				var findthis="*";					//For 'empty' and 'replace', we want to set it back to the beginning of the list
				if (request.type=='update' && mythis.songIdListCnt>0) {
					var i=mythis.nextSongIdx-1;			//The last song we sent to LiquidSoap is the 'next' minus 1
					if (i<0) {i=mythis.songIdListCnt-1};	//Might need to wrap around
					findthis=mythis.songIdList[i];		//This is the one that we want to find to make the one after it 'next'
					console.log("findthis: "+findthis+" nextSongIdx: "+mythis.nextSongIdx+" i: "+i);
					console.log(mythis.songIdList);
				}	
				mythis.saveSongIds(tracks);				//Fill the list of all the Ids in the playlist
				mythis.setNextSongIdx(findthis);
				console.log("nextSongIdx: "+mythis.nextSongIdx+" oldPlId: "+findthis+" #tracks: "+mythis.songIdListCnt);
				console.log(mythis.songIdList);
			}
			var rtn=mythis.tracksobj2array(tracks);		//Crunch it into an array instead of an object
			console.log(request);
			soi.emit(request.event,JSON.stringify(rtn));
		});
	}
	
	//This gets all the songs in the 'current' playlist (useful after a reposition, delete, or drop)
	getCurrentPlaylist = function(request) {
		return getPlaylistTracks(mythis.audioboxId,request);
    }
    
    //Get the lists of 'visiable' playlists
    getSavedLists = function(request) {
		sql='SELECT  pl.name, count(l.id) AS nbr_tracks, sum(l.duration) AS run_time, pl.id FROM library AS l LEFT JOIN PlaylistTracks AS plt ON plt.track_id=l.id LEFT JOIN Playlists AS pl ON plt.playlist_id=pl.id WHERE hidden!=2 GROUP BY name ORDER BY name';
    	var soi=myio;
		db.all(sql,{},function (err, tracks) {
			console.log(tracks);
			var i;
			var tl=tracks.length;
			var rtn=Array();
			for (i=0; i<tl; i++) {
				var atrack=tracks[i];
				var arow=Array();
				arow[0]=atrack.name;
				arow[1]=atrack.nbr_tracks;
				arow[2]=atrack.run_time;
				arow[3]=atrack.id;
				rtn.push(arow);
			}
			soi.emit(request.event,JSON.stringify(rtn));
		});
    }
    //Empties the current playlist of all tracks - it does not 'delete' it.
    emptyCurrentList=function (request) {
    	sql="DELETE FROM PlaylistTracks WHERE playlist_id=?";
    	db.run(sql,mythis.audioboxId,function (result) {
    		//Once the delete finishes, we just return the now empty current playlist
    		mythis.getCurrentPlaylist(request);
    	});
    }
    //Create a new playlist entry
    createPlaylist=function (listname, hidden, callback) {
    	//This is a super uggly insert/select, but it avoids a ton of callbacks.  And we won't be doing this much
    	var sql="INSERT INTO Playlists (name, position, hidden, date_created, date_modified) SELECT ?,max(position)+1,?,datetime('now'),datetime('now') FROM Playlists";
    	db.run(sql,[listname, hidden],function(result) {
    		console.log("Created List ID: "+this.lastID+" named: "+listname);
    		callback(this.lastID);
    	});
    }
    
    //Liquidsoap will call this to get the next song to play.
    getNextSongFileName=function(express_res) {
    	var thisPlId=mythis.songIdList[mythis.nextSongIdx]
		console.log('getNextSongFileName: '+thisPlId+" : "+mythis.songIdListCnt+" : "+mythis.nextSongIdx);
    	var sqlid=thisPlId.split("z");		//We are interested in the PlaylistTracksId part for the sql
    	sqlid=sqlid[0];
    	var sql="SELECT tl.location FROM PlaylistTracks AS plt LEFT JOIN library AS lib ON lib.id=plt.track_id LEFT JOIN track_locations AS tl ON lib.location=tl.id WHERE plt.id=?";
    	db.get(sql,sqlid,function (err,row) {
    		var filename=row.location.replace("D:/RealMusic/","/mnt/remotemusic/");
    		express_res.send('annotate:theplid="'+thisPlId+'":'+filename);
    		console.log('annotate:theplid="'+thisPlId+'":'+filename);
    	});
    	//Bump this index AFTER we pass it off to the query
    	mythis.nextSongIdx++;				//Bump the 'current position' index
    	if (mythis.nextSongIdx>=mythis.songIdListCnt) {
    		//Reset it back to start for now (V2 we will need to stop LS if we don't want to repeat)
    		mythis.nextSongIdx=0;
    	}
    }
    
	//Return the object model
	return this;
};
module.exports = audiobox_model;
