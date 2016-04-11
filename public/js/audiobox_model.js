//*************** audiobox_model *********************
// Events I Emit:
// setUpDone() - After all the setUp is complete.
// songStarted(songInfo) - When we are told that LiquidSoap is playing a song.
//                         Technically, it might be in the middle of a song, if a browser connects after LiquidSoap has already started playing.
// songCrates(crate list) - This is the list of crates that a particular track is in (normally it's the currently playing track)
// cratesList(all crates) - Returns a list of all the available crates
// gotReviewList(song list) - Songs from either search or playlist review
// gotAnError(error message) - General event when I have some error to send back to the browser
// startStop('stop') - When I need to tell LS to stop playing (generally because I don't have a song to play)
// gotCurrentSongList - When I want to return the current song list
// gotPlayLists(playlist list) - When I return the list of playlists available
// gotPlayListNames(name list) - Returns a simple list of the playlist names so browser can grandmother on save.

var sqlite3 = require('sqlite3').verbose();

var db = new sqlite3.Database('./db/audioboxdb.sqlite',sqlite3.OPEN_READWRITE);
var audioboxId;				//This is the 'AUDIOBOX' playlist id
var nextSongIdx=0;			//The index to the next song to play in songIdList
var songPlaying=["*",""];	//[0]=current playing status (*=never started, r=running, p=paused)
							//[1]=songId of currently playing song
var songIdListCnt=0;		//The number of songs in the current playlist
var songIdList=[];			//The PlaylistId_TrackIds for the songs to play, in play order
							//NOTE: sqlite reuses a id of deleted rows.  So if we delete & add a playlist
							//      PlaylistId might not be unique if we change/replace the playlist while something is playing
var emitter;

function saveSongIds(rows) {
	var i;
	songIdListCnt=rows.length;
	songIdList=[];
	for (i=0; i<songIdListCnt; i++) {
		songIdList.push(getSongId(rows[i]));
	}
	console.log("Loaded songIdList:"+songIdListCnt);
}
//This is a helper routine to return the 'unique' songId - so I only need to change it one place...
function getSongId(arow) {
	return arow.id+"_"+arow.track_id;
}
//This is a helper routine to return the 'pieces' of a songId - so I only need to change it one place...
function splitSongId(aSongId) {
	return aSongId.split('_');
}
//This is just a simple function to convert the object that SQLITE returns to an array so send back to the browser
function tracksobj2array(tracks) {
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
		arow[4]=atrack.position;
		arow[5]=atrack.name;
		arow[6]=atrack.track_id;
		arow[7]=atrack.duration;
		arow[8]=getSongId(atrack);
		arow[9]=atrack.added_time;
		rtn.push(arow);
	}
	return rtn;
}
//Collect the random tracks to play - NOTE: This will call itself, but it really isn't recursive
function collectRandomSongs(libInfo, callback) {
	//See if we are done yet.
	if (libInfo.collected>=25) {
		callback();
	} else {
		//We need to get another one
		//NOTE: The 'problem' is that sqlite applies the LIMIT after the result set is created.
		//       So, if I have a high percentage of unplayed songs, I could get a large result set
		//       and only pick one.
		//       But, if I have a low percentage, my odds of actually finding one in a small range gets small
		var startat=Math.floor(Math.random()*libInfo.maxid);
		var endat=startat+10;
		if (libInfo.availratio<0.25) {
			//If we don't have 'many'... then we will give sqlite a larger range.
			endat=libInfo.maxid;
		}
		var sql="SELECT id FROM Library WHERE id>=? AND id<+? AND  times_played=0 LIMIT 1";
		console.log("Trying: "+startat+" - "+endat);
		db.all(sql,[startat,endat], function(err,rows) {
			//NOTE: purists might argue that this isn't 'truly' random - but it's close enough for what we are doing
			if (rows.length==1) {
				sql="INSERT INTO Playlist_Tracks (playlist_id, track_id, position) VALUES (?, ?, ?)"; 
				db.run(sql,[audioboxId,rows[0].id,libInfo.collected+1],function(result) {
    				console.log("Random Track Insert: "+this.lastID+" > "+rows[0].id);
    				libInfo.collected++;
					collectRandomSongs(libInfo, callback);
    			});
			} else {
				//Just go try to get another one	
				collectRandomSongs(libInfo, callback);
			}	
		});
	}
}
//Create a new playlist entry
function createPlaylist(listname, hidden, callback) {
    //This is a super uggly insert/select, but it avoids a ton of callbacks.  And we won't be doing this much
    var sql="INSERT INTO Playlists (name, position, date_modified) SELECT ?,max(position)+1,?,datetime('now') FROM Playlists";
    db.run(sql,[listname, hidden],function(result) {
    	console.log("Created List ID: "+this.lastID+" named: "+listname);
    	callback(this.lastID);
    });
}
//Once we have the ID we want to copy TO, then we can delete everything from there, and copy everything over
function copyCurrent(toid) {
	db.serialize(function() {
		//First we delete all the track from the 'to' list
		var sql='DELETE FROM Playlist_Tracks WHERE playlist_id=?';
		db.run(sql,[toid]);
		sql='INSERT INTO Playlist_Tracks (playlist_id, track_id, position) SELECT ?,track_id, position FROM Playlist_Tracks WHERE playlist_id=?';
		db.run(sql,[toid,audioboxId], function(result) {;
			console.log('Copied from: '+audioboxId+' to: '+toid);
		});
	});
}
//Simply get a complete list of all the crates available - with the event as a parameter
function getAllCrates(eventName) {
	var sql="SELECT C.*, SUM(CASE WHEN CT.crate_id IS NULL THEN 0 ELSE 1 END) AS track_count FROM Crates AS C LEFT JOIN Crate_Tracks AS CT ON C.id=CT.crate_id GROUP BY C.id ORDER BY name";
	//var sql="SELECT id, name FROM Crates ORDER BY name";
	db.all(sql,{},function(err,rows) {
		var crates=Array();
		var i;
		var rl=rows.length;
		for (i=0; i<rl; i++) {
			crates.push([rows[i].id, rows[i].name,rows[i].track_count]);				
		}
		emitter.emit(eventName,JSON.stringify(crates));
	});
}


/******************* Exported stuff follows ***********************/
module.exports = Audiobox_Model;
function Audiobox_Model(emitter2use) {
	emitter=emitter2use;
}
//Remove a song from the current playlist
function removeFromList(request) {
	//First, we need to find the entry in the current playlist
	plinfo=splitSongId(request.plid);
	plinfo.push(audioboxId);
	var sql="SELECT position FROM Playlist_Tracks WHERE id=? AND track_id=? AND playlist_id=?";
	db.all(sql,plinfo,function(err, theone) {
		//Should only get one (might not get any if two people remove quickly enough
		if (theone.length=1) {
			sql="DELETE FROM Playlist_Tracks WHERE id=?";
			db.run(sql,plinfo[0], function(result) {
				console.log('Deleted entry: '+plinfo[0]+" : "+this.changes);
				sql="UPDATE Playlist_Tracks SET position=position-1 WHERE position>? AND playlist_id=?";
				db.run(sql,[theone[0].position,audioboxId],function(result) {
					console.log("Updated Position: "+this.changes);
					getCurrentPlaylist("remove");	//Return the new playlist to the browser.
				});
			});
		}
	});
}
//Make the requested song the 'next' one in the list.
function meNext(request) {
	//First we need to find the entry
	plinfo=splitSongId(request.plid);
	//var thisPlId=songIdList[nextSongIdx];
	ridx=songIdList.indexOf(request.plid);
	if (ridx==0) {
		//Can't find it in list (probably somebody else changed the list under us
		emitter.emit("gotAnError",'{"error":"Cannot make "+request.plid)+" next."}');
	} else {
		//This will set things up so that when LS requests the next song.. we get the on requested.
		nextSongIdx=ridx;
	}
}
//Get the songs in a crate for review (basically the same 'data' as returned from search and playlist review
function getCrateForReview(request) {
    //NOTE: we 'fudge' up a select list which looks close to the one we get from a playlist so we can handle them
	var sql="SELECT 0 AS id, artist, album, title, 0 AS position, 'Crate' AS name, Library.id AS track_id, duration, added_time FROM Library LEFT JOIN Crate_Tracks AS ct ON ct.track_id=Library.id WHERE crate_id=?"
	db.all(sql,[request.cid],function (err, tracks) {
		var rtn=tracksobj2array(tracks);		//Crunch it into an array instead of an object
		console.log("getCrateForReview: "+request.cid);
		emitter.emit("gotReviewList",JSON.stringify(rtn));
	});
}

//Create a new crate (and then send back the new complete list of crates
function createCrate(request) {
	var sql="INSERT INTO Crates (name) VALUES (?)";
    db.run(sql,[request.named],function(result) {
    	console.log("Created Crate ID: "+this.lastID+" named: "+request.named);
    	//Now we can sent the browser the new set of crates.
    	getCratesList();
    });
}
//Setup is a seperate function, because you can't register an event handler until after the object is created.
function setUp(callback) {
	var sql='SELECT id FROM Playlists WHERE name="AUDIOBOX CURRENT"';
	db.get(sql,{},function(err, row) {
		if (typeof row == 'undefined') {
			//For now. we will just kill NODE if this doesn't exist.  
			//Eventually, we will create this playlist when we initially create the tables.
			console.log('AUDIOBOX CURRENT does not exist');
			process.exit(100);
		} else {
			audioboxId=row.id;
			console.log('Audiobox Playlist ID: '+audioboxId);
			//We also need to get the list of tracks in case LiquidSoap is already playing something
			sql='SELECT id, track_id FROM Playlist_Tracks WHERE playlist_id=? ORDER BY position';
			db.all(sql,audioboxId, function(err,rows) {
				saveSongIds(rows);			//Save all the Ids
				setNextSongIdx("*");			//Set to beginning of list
				callback();
			});
		}
	});
}
//Find and set the next song we want to play from the songIdList
// requestPlid is the last songId that we gave LiquidSoap to prepare (might be different than what is playing)
function setNextSongIdx(requestedPlid) {
	var ridx=requestedPlid.replace(/"/g, "");		//Was just to complicated to drop the quotes in LiquidSoap
	ridx=songIdList.indexOf(ridx);
	if (ridx<0) {
		//We turned a song over to LiquidSoap, but can't find it in the current playlist
		//This could occur if we swapped playlists, or deleted an entry.
		nextSongIdx=0;		//Reset this to the beginning
	} else {
		//We found it.. so 'next' is really that one +1
		nextSongIdx=ridx+1;
		//Reset back to start if we sent it the last one
		if (nextSongIdx>=songIdListCnt) {
			nextSongIdx=0;
		}
	}
	console.log("Next Song Idx:"+nextSongIdx);
}
//Sets the currently playing song information from LiquidSoap
function setSongPlaying(status, playingSongId) {
	songPlaying=[status,playingSongId];
}
//Once we get told Liquidsoap has started the song, we need to tell the browser that it has started, then adjust the playlist
//NOTE: theSongId contains both the playlist track id and the track id.  The song MIGHT not be in the playlist track id.
//      so we only rely on the track id.
//      ALSO.. if request.remaining >0, then we will use that instead of from the track table because the song has already started
function getSongStarted(timeRemaining) {
	var lines=splitSongId(songPlaying[1]);		//We use the track_id, not the playlisttrack id
 	var sql="SELECT title, duration, id AS track_id, rating, artist FROM Library WHERE id=?";   	
	db.get(sql,lines[1],function(err, row) {
		if (row=='undefined') {
			console.log("Not in Library: "+songPlaying[1]);
			emitter.emit("gotAnError",'{"err":"Not in Library:'+songPlaying[1]+'"}');
			return;
		}
    	console.log("Now Playing: "+row.title+" ("+row.duration+")");
    	//See if we are already part way into the song
    	if (timeRemaining!== undefined) {
    		row.duration=timeRemaining;
    	}
    	//Tell the browser to start showing that the song is playing.
    	row.songId=songPlaying[1];
    	row.playerStatus=songPlaying[0];
		console.log(JSON.stringify(row));
		emitter.emit("songStarted",JSON.stringify(row));
    });
	//And we need to tell the browser what crates this song is currently in
	//We don't need to wait for this to return.
	getSongCrates({track_id:lines[1]});
}
//Simply get a complete list of all the crates available (event is cratesList)
function getCratesList() {
	getAllCrates("cratesList");
}
//Simply get a complete list of all the crates available (event is cratesListReview)
function getCratesListReview() {
	getAllCrates("cratesListReview");
}

//Get the crates that a song is in.
function getSongCrates(request) {
	var sql="SELECT crate_id FROM Crate_Tracks WHERE track_id=?";
	db.all(sql,[request.track_id],function(err,rows) {
		//The first entry is the track id
		var crates=[request.track_id];
		var i;
		var rl=rows.length;
		for (i=0; i<rl; i++) {
			crates.push(rows[i].crate_id);
		}
		console.log("Sending Crates: "+JSON.stringify(crates));
		emitter.emit("songCrates",JSON.stringify(crates));
	});
}
//Change the crates a song is in
function cratesChanged(request) {
	//So, the first thing we need to do is determine where it is currently referenced.
	var track_id=request.shift();			//The track_id is the first entry in the array, then the crate id's that were selected
	var sql="SELECT id FROM Crate_Tracks LEFT JOIN Crates ON id=crate_id WHERE track_id=?";
	db.all(sql,[track_id],function(err,rows) {
	    //If it is in the new set, and the old set, then we don't need to do anything.
	    //If it is in the old only, we need to delete it from crate_tracks and decrement the count in crates.
	    //If it is in the new set only, we need to add it to crate_tracks, and add to the count in crates.
	    var i;
	    var idx;
	    var cnt=rows.length;
	    //Loop through all the ones it is currently in
	    var deleteIn='';
	    for (i=0; i<cnt; i++) {
	    	//See if it is present in both the selected list, and the current list
	    	idx=request.indexOf(rows[i].id);
	    	if (idx<0) {
	    		//No.. it WAS present, but was NOT selected
	    		//We need to delete it from the crate_tracks
	    		if (deleteIn.length>0) {
	    			deleteIn+=',';
	    		}
	    		deleteIn+=rows[i].id;
	    		//We don't need to remove it from request, since it wasn't in there.
	    	} else {
	    		//It is in both places, so all we need to do is remove it from request as we have 'handled' it
	    		request.splice(idx,1);
	    	}	    			
	    }
	    if (deleteIn.length>0) {
	    	sql="DELETE FROM Crate_Tracks WHERE track_id=? AND crate_id IN ("+deleteIn+')';
	    	db.run(sql,[track_id],function(result) {
	    		console.log("Crate Track Delete: "+this.changes+" @ "+track_id);
	    	});
	    }
	    //Anything left in request has to be added
	    //We need to build up multiple inserts.  SQLITE can't handle the multiple rows in an insert.
	    cnt=request.length;
	    sql='';
	    for (i=0; i<cnt; i++) {
	    	//Insert it into the tracks table
	    	//If we already have one, we need to put semicolons in.
	    	if (sql.length>0) {
	    		sql+=';';
	    	}
	    	sql+="INSERT INTO Crate_Tracks (crate_id, track_id) VALUES ("+request[i]+','+track_id+')';
	    }
	    if (sql.length>0) {
	    	db.exec(sql,function(err) {
	    		console.log("Crate Track Insert.")
	    		console.log(sql);
	    		if (err) {
	    			console.log(err);
	    		}
	    	});
	    }
	});
}
//Change the rating on the song
function ratingChanged(request) {
	var sql="UPDATE Library SET rating=? WHERE id=?";
	db.run(sql,[request.rating,request.id],function(result) {
		console.log("Rating Update: "+this.changes);
	});
}
	
//This gets all the songs in the 'current' playlist (useful after a reposition, delete, or drop)
function getCurrentPlaylist(reason) {
    var sql="SELECT  plt.id, l.artist, l.album, l.title, plt.position, pl.name, plt.track_id, l.duration, l.added_time FROM Library AS l LEFT JOIN Playlist_Tracks AS plt ON plt.track_id=l.id LEFT JOIN Playlists AS pl ON plt.playlist_id=pl.id WHERE pl.id=? ORDER BY plt.position, plt.id";
    var i;
	db.all(sql,[audioboxId],function (err, tracks) {
		//We want to update the information about the tracks in it depending on why we got here.
		if (reason!="simple") {					//Simple is just asking for the current list - so we don't need to do anything special
			saveSongIds(tracks);				//Fill the list of all the Ids in the playlist
			var findthis='*';					//For 'empty' and 'replace', we want to set it back to the beginning of the list
			if (reason=="update" && songIdListCnt>0) {
				//If it is afer an update, we will 'try' to find the last song we sent to LiquidSoap and adjust 'next' based on that
				var i=nextSongIdx-1;			//The last song we sent to LiquidSoap is the 'next' minus 1
				if (i<0) {
					i=songIdListCnt-1;			//Might need to wrap around
				};
				findthis=songIdList[i];			//This is the one that we want to find to make the one after it 'next'
				console.log("findthis: "+findthis+" nextSongIdx: "+nextSongIdx+" i: "+i);
			}	
			setNextSongIdx(findthis);			//Set the next song as appropriate
			console.log("nextSongIdx: "+nextSongIdx+" oldPlId: "+findthis+" #tracks: "+songIdListCnt);
			//console.log(songIdList);
			if (reason=="remove" && songIdListCnt==0) {
				//If we removed the last song, we need to stop the player...
				console.log("Removed last song from the current playlist.");
				//This will have the server (me) issue the stop to LS
				emitter.emit("startStop",'{"makeit":"stop"}');
				//I wouldn't consider this an 'error', so we don't send that kind of message back to browers.
			}
		}
		var rtn=tracksobj2array(tracks);		//Crunch it into an array instead of an object
		console.log("getCurrentPlayList: "+reason);
		emitter.emit("gotCurrentSongList",JSON.stringify(rtn));
	});
}
//Getting a playlist to review it instead of making it the 'current' playlist
function getForReview(request) {
    var sql="SELECT  plt.id, l.artist, l.album, l.title, plt.position, pl.name, plt.track_id, l.duration FROM Library AS l LEFT JOIN Playlist_Tracks AS plt ON plt.track_id=l.id LEFT JOIN Playlists AS pl ON plt.playlist_id=pl.id WHERE pl.id=? ORDER BY plt.position, plt.id";
    var i;
	db.all(sql,[request.plid],function (err, tracks) {
		var rtn=tracksobj2array(tracks);		//Crunch it into an array instead of an object
		console.log("getForReview: "+request.plid);
		emitter.emit("gotReviewList",JSON.stringify(rtn));
	});
}

//Returns the current 'song playing' status
function getCurrentStatus() {
	return songPlaying[0];
}
//Create a playlist of 25(?) random songs
function makeRandomPlaylist() {
	//First we empty out all the tracks from the AUDIOBOX playlist
	var sql="DELETE FROM Playlist_Tracks WHERE playlist_id=?";
	db.run(sql,[audioboxId],function(result) {
		console.log("Random - Delete done: "+this.changes);
		songIdListCnt=0;		//Clean out our table
		songIdList=[];
		//This is an 'expensive' query (it will scan the whole library), so we only do it once
		sql="SELECT MAX(id) AS maxid, COUNT(id) AS available FROM Library WHERE times_played=0";
		db.all(sql,[],function(err,rows) {
			//available/maxid is 'sort of' the percentage of unplayed songs we have
			rows[0].availratio=rows[0].available/rows[0].maxid;
			rows[0].collected=0;
			console.log("Random - libInfo");
			console.log(rows[0]);
			collectRandomSongs(rows[0],function () {
				console.log("Random - collection done");
				getCurrentPlaylist("replace");
			});
		});
	});
}
//Empties the current playlist of all tracks - it does not 'delete' it.
//Server takes care of telling LS to stop.
function emptyCurrentList() {
    var sql="DELETE FROM Playlist_Tracks WHERE playlist_id=?";
    db.run(sql,[audioboxId],function (result) {
    	//Once the delete finishes, we just return the now empty current playlist
    	getCurrentPlaylist("empty");
    });
}
//Get the list of 'visiable' playlists and information about how many songs are in them
function getPlaylists() {
	var sql='SELECT  pl.name, count(l.id) AS nbr_tracks, sum(l.duration) AS run_time, pl.id, pl.date_modified FROM Library AS l LEFT JOIN Playlist_Tracks AS plt ON plt.track_id=l.id LEFT JOIN Playlists AS pl ON plt.playlist_id=pl.id WHERE pl.id <> ? GROUP BY name ORDER BY name';
	db.all(sql,[audioboxId],function (err, playlists) {
		var i;
		var pl=playlists.length;
		var rtn=[];
		for (i=0; i<pl; i++) {
			var aplaylist=playlists[i];
			var arow=Array();
			arow[0]=aplaylist.name;
			arow[1]=aplaylist.nbr_tracks;
			arow[2]=aplaylist.run_time;
			arow[3]=aplaylist.id;
			arow[4]=aplaylist.date_modified;
			rtn.push(arow);
		}
		emitter.emit("gotPlaylists",JSON.stringify(rtn));
	});
}

//This simply gets the list of names of playlists for when the browser wants to save a playlist
function getPlaylistNames() {
	var sql="SELECT name FROM Playlists WHERE hidden !=2 ORDER BY name";
	db.all(sql,{},function(err,names) {
		var i;
		var nl=names.length;
		var rtn=[];
		for (i=0; i<nl; i++) {
			rtn.push(names[i].name);
		}
		emitter.emit("gotPlaylistNames",JSON.stringify(rtn));
	});
}

//Save the 'current' playlist to the named playlist (creating if necessary).
//NOTE: we don't send anything back to the browser, since nothing has really changed
function saveCurrentList(theName) {
	var sql='SELECT id,name FROM Playlists WHERE name=?';
	db.get(sql,[theName],function(err,row) {
		if (typeof row != 'undefined') {
			//It already exists, we will just delete all and copy over
			copyCurrent(row.id);
		} else {
			//Otherwise, we need to create it before we copy
			createPlaylist(theName,0,copyCurrent);
		}
	});
}
//Perform the search of the database for the requested type (song, artist, album)
function doSearch(request) {
	var fullterm=request.term.trim();
	var words=fullterm.split(" ");			//Individual words (space separator)
	if (words.length==0 || fullterm.length==0) {
		//Just return an empty list
	}
    //NOTE: we 'fudge' up a select list which looks close to the one we get from a playlist so we can handle them
	var sql="SELECT 0 AS id, artist, album, title, 0 AS position, 'Search' AS name, Library.id AS track_id, duration, added_time FROM Library WHERE ";
	//We first query for the full term in the field, then we will do the individual words
	db.all(sql+request.type+" LIKE ? ORDER BY "+request.type,["%"+fullterm+"%"],function (err, fulllist) {
		var rtn=tracksobj2array(fulllist);	//We will at least return this much...
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
		//Don't bother:
		// 1) No 'good' words were found
		// 2) Only 1 word in the 'fullterm'
		// 3) We already have > 200 from the fullterm search
		if (l>0 && words.length>1 && fulllist.length<200) {
			for (i=0; i<l; i++) {
				searchterms[i]="%"+searchterms[i]+"%";
			}
			l=200-fulllist.length;				//We really only want to return 200 max.
			//We should check to see if searchterms has zero or one entry, and not bother if so.
			db.all(sql+whereparts.join(" AND ")+" ORDER BY "+request.type+" LIMIT "+l,searchterms,function (err, termslist) {
				//Build a temporary array with just the full term Id so we can check for dups easier
				var tmp=[];
				l=rtn.length;
				for (i=0; i<l; i++) {
					tmp.push(rtn[i][6]);
				}
				var rtn2=tracksobj2array(termslist);
				l=rtn2.length;
				//Check for duplicates
				for (i=0; i<l; i++) {
					if (tmp.indexOf(rtn2[i][6])<0) {
						rtn.push(rtn2[i]);
					}
				}
				emitter.emit("gotReviewList",JSON.stringify(rtn));
			});
		} else {
			emitter.emit("gotReviewList",JSON.stringify(rtn));
		}
	});
}	
//We want to update the current playlist (either by moving a song within it, or dropping a new song into it
function updatePlaylist(request) {
    //request=beforethis,movethis,dothistype
    var sql;
    var param;
    if (request.beforethis=='atEnd') {
    	//If we want to move it 'before the end', we need to find the current max position (which might be NULL if the list is empty)
    	sql="SELECT MAX(position) AS position FROM Playlist_Tracks WHERE playlist_id=?";
    	param=audioboxId;
    } else {    	
    	//Otherwise, we are going to need the position of where we are moving to
	    sql="SELECT position FROM Playlist_Tracks WHERE id=?";
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
					sql="UPDATE Playlist_Tracks SET position=position+1 WHERE playlist_id=? AND position>=?";
					db.run(sql,[audioboxId,before],function(res) {
						console.log("S - After positions update:"+this.changes);						
					});
				}				
				var sql="INSERT INTO Playlist_Tracks (playlist_id, track_id, position) VALUES (?, ?, ?)";
				db.run(sql,[audioboxId,request.movethis,before],function (res) {
					console.log("S - After insert item:"+this.lastID);
					getCurrentPlaylist("update");
				});							
			});
		} else {
			//If we are moving within the list, we need to know the position of the one we are moving
	    	var sql="SELECT position FROM Playlist_Tracks WHERE id=?";
	    	db.get(sql,request.movethis, function (err, row) {
	    		var move=parseInt(row.position);
	    		console.log('Moving ID: '+move);
				//Run the two updates in serial
				db.serialize(function() {
		    		var sql;
		    		var parm
					if (request.beforethis=='atEnd') {
						//If we are adding to the end, then we need to move everything 'up'
						sql="UPDATE Playlist_Tracks SET position=position-1 WHERE position>? AND playlist_id=?";
						parm=[move,audioboxId];
					} else if (before<move) {
						//We are moving 'up', so we need to move everything 'down' to make room
						sql="UPDATE Playlist_Tracks SET position=position+1 WHERE position >=? AND position<? AND playlist_id=?";
						parm=[before,move,audioboxId];
					} else {
						//We are moving 'down', so we need to slide everything up to make room
						sql="UPDATE Playlist_Tracks SET position=position-1 WHERE position >? AND position<? AND playlist_id=?";
						parm=[move,before,audioboxId];
						//NOTE: We decrement before AFTER we create the parms, because it will now be what we want to make the new entry
						before--;
					}
					//First the one to adjust the other entries	
					db.run(sql,parm,function(res) {
						console.log("P - After positions update:"+this.changes);						
					});
					//And we always need to update the position of the one we are moving
					var sql="UPDATE Playlist_Tracks SET position=? WHERE id=?";
					db.run(sql,[before,request.movethis],function(res) {
						console.log("P - After update moved item:"+this.changes);
						getCurrentPlaylist("update");							
					});
				});
	    	});
		}
	});
}
//Replace the 'current' playlist with the tracks from the selected playlist
function replaceCurrentList(request) {    	
    //Serialize the delete and insert to simplify the callback
    db.serialize(function() {
		var theid=request.withID;
		//Clear out all the tracks from the 'current' playlist
		var sql="DELETE FROM Playlist_Tracks WHERE playlist_id=?";
		db.run(sql,audioboxId);
		//Get the tracks and positions from the requested playlist and insert them into the AUDIOBOX playlist
    	sql='INSERT INTO Playlist_Tracks (playlist_id, track_id, position) SELECT '+
    		audioboxId+
    		',plt.track_id, plt.position FROM Playlist_Tracks AS plt LEFT JOIN Playlists AS pl ON plt.playlist_id=pl.id WHERE pl.id=?';
    	db.run(sql, theid, function(result) {
			getCurrentPlaylist("replace");
    	});
    });
}	
//When the browser wants to play a song locally, we need to full location
//NOTE: This is called when the browser changes the 'scr' for the audio element
//      so we send the file back (via the controller), and to not emit anything unless we can't find the track
function getTrackFileLocation(thisTrack,callback) {
    var sql="SELECT filename,directory FROM Library WHERE id=?";
	db.get(sql,thisTrack, function(err,row) {
		if (typeof row != 'undefined') {
    		var filename=row.directory.replace("D:/music/RealMusic/","/mnt/remotemusic/")+'/'+row.filename;
			callback(filename);
		} else {
			emitter.emit("gotAnError",'{"err":"Missing Track Location: '+thisTrack+'"}');
			callback('');
		}
	});
}
//Skip - we need to '+' or '-' the nextSongIdx
function skipSong(direction) {
	if (songIdListCnt<2 || direction=='+') {
		//Forward/backward doesn't make any difference if we only have 0 or 1 entries
		//And forward doesn't require any changes from us.  'next' is already set.
		return;
	}
	//We subtract 2 because it is 'next' song.. if we did 1, then we would be back to the currently playing song
	console.log("Skip - before: "+nextSongIdx);
	nextSongIdx=nextSongIdx-2;
	if (nextSongIdx<0) {
		nextSongIdx=songIdListCnt+nextSongIdx;
	}
	console.log("Skip - after: "+nextSongIdx);
}
//When we get new information from LiquidSoap that it started a new song
function setSongStarted (theSongId) {
	setSongPlaying('r',theSongId);
	var songParts=splitSongId(theSongId);
	//I don't need to worry about exactly when this gets completed.
    var sql="UPDATE Library SET times_played=times_played+1 WHERE id=?";
    db.run(sql,[songParts[0]],function(result) {
    	console.log("Timesplayed Done: "+this.changes);
    });
}
//Liquidsoap will call this to get the next song to play.
function getNextSongFileName(express_res) {
    var thisPlId=songIdList[nextSongIdx];
	if (thisPlId==undefined || songIdListCnt==0) {
		//Not good.. we don't have a song to give.. better tell LS to stop
		console.log("getNextSongFileName: FAILED."+" : "+songIdListCnt+" : "+nextSongIdx);
		//This will have the server (me) issue the stop to LS
		emitter.emit("startStop",'{"makeit":"stop"}');
		//Maybe we should return a fallback mp3?
		express_res.send('annotate:theplid="undefined":missing.mp3');
		emitter.emit("gotAnError",'{"error":"LS requested a file and I do not have one."}');
	}
	console.log('getNextSongFileName: '+thisPlId+" : "+songIdListCnt+" : "+nextSongIdx);
    var sqlid=splitSongId(thisPlId);		//We are interested in the PlaylistTracksId part for the sql
    sqlid=sqlid[0];
    var sql="SELECT filename,directory FROM Playlist_Tracks AS plt LEFT JOIN Library AS l ON l.id=plt.track_id WHERE plt.id=?";
    db.get(sql,sqlid,function (err,row) {
    	var filename=row.directory.replace("D:/music/RealMusic/","/mnt/remotemusic/")+'/'+row.filename;
    	express_res.send('annotate:theplid="'+thisPlId+'":'+filename);
    	console.log('annotate:theplid="'+thisPlId+'":'+filename);
    });
    //Bump this index AFTER we pass it off to the query
    nextSongIdx++;				//Bump the 'current position' index
    if (nextSongIdx>=songIdListCnt) {
    	//Reset it back to start for now (V2 we will need to stop LS if we don't want to repeat)
    	nextSongIdx=0;
    }
}
function getSongPlaying() {
	return songPlaying;
}
Audiobox_Model.prototype.setUp = setUp;
Audiobox_Model.prototype.setNextSongIdx = setNextSongIdx;
Audiobox_Model.prototype.setSongPlaying = setSongPlaying;
Audiobox_Model.prototype.getSongStarted = getSongStarted;
Audiobox_Model.prototype.getSongCrates = getSongCrates;
Audiobox_Model.prototype.getCratesList = getCratesList;
Audiobox_Model.prototype.cratesChanged = cratesChanged;
Audiobox_Model.prototype.ratingChanged = ratingChanged;
Audiobox_Model.prototype.getCurrentPlaylist = getCurrentPlaylist;
Audiobox_Model.prototype.getCurrentStatus = getCurrentStatus;
Audiobox_Model.prototype.makeRandomPlaylist = makeRandomPlaylist;
Audiobox_Model.prototype.emptyCurrentList = emptyCurrentList;
Audiobox_Model.prototype.getPlaylists = getPlaylists;
Audiobox_Model.prototype.getPlaylistNames = getPlaylistNames;
Audiobox_Model.prototype.saveCurrentList = saveCurrentList;
Audiobox_Model.prototype.doSearch = doSearch;
Audiobox_Model.prototype.getForReview = getForReview;
Audiobox_Model.prototype.updatePlaylist = updatePlaylist;
Audiobox_Model.prototype.replaceCurrentList = replaceCurrentList;
Audiobox_Model.prototype.getTrackFileLocation = getTrackFileLocation;
Audiobox_Model.prototype.skipSong = skipSong;
Audiobox_Model.prototype.setSongStarted = setSongStarted;
Audiobox_Model.prototype.getNextSongFileName = getNextSongFileName;
Audiobox_Model.prototype.getSongPlaying = getSongPlaying;
Audiobox_Model.prototype.createCrate = createCrate;
Audiobox_Model.prototype.getCrateForReview = getCrateForReview;
Audiobox_Model.prototype.getCratesListReview = getCratesListReview;
Audiobox_Model.prototype.removeFromList = removeFromList;
Audiobox_Model.prototype.meNext = meNext;

