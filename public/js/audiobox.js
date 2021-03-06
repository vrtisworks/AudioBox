$( document ).ready(function() {
	//Set up all the event callbacks once.
	MyBox.Socket.on("gotAnError",gotAnError);					//When the server has an error to tell the user.
	MyBox.Socket.on("gotCurrentSongList",gotCurrentSonglist);	//When we get the list of songs in the current playlist
	MyBox.Socket.on("gotPlaylists",gotPlaylists);				//When we get a list of playlists for the right side
	MyBox.Socket.on("gotPlaylistNames",gotPlaylistNames);		//When we the list of playlists as part of saving a playlist
	MyBox.Socket.on("gotReviewList",gotReviewList);				//When we get a list of songs in a playlist for the right side
	MyBox.Socket.on("songStarted",songStarted);					//When we are told LiquidSoap just started a song
	MyBox.Socket.on("songStopped",songStopped);					//When we are told LiquidSoap just started a song
	MyBox.Socket.on("songCrates",songCrates);					//When we get the list of crates that the playing song is part of
	MyBox.Socket.on("cratesList",gotCratesList);				//When we get the complete list of crates for the select list
	MyBox.Socket.on("cratesListReview",gotCratesListReview);	//When we get the complete list of crates for review
	MyBox.Socket.on("clearCurrentPlaying",clearCurrentPlaying);	//When the playlist is replaced, nothing is playing.
	//Ask for the list of crates available
	MyBox.Socket.emit("getCratesList",'');
	//Get the current playlist
	MyBox.Socket.emit('getCurrentPlaylist','');
});

//For 'now', we will just alert the user that there was an error...  Not much we can do about it yet.
function gotAnError(msg) {
	var data=playlists=JSON.parse(msg);
	alert(msg);
}
//Start/stop the player
function startStop() {
	//Get the current setting (can tell from the class)
	if (document.getElementById("audioboxplaybutton").className.indexOf('fa-pause')>=0) {
		MyBox.Socket.emit("startStop",'{"makeit" : "stop"}');		
	} else if (MyBox.Playlist.length>0) {
		//Only request the start if we have something in the playlist
		MyBox.Socket.emit("startStop",'{"makeit" : "start"}');		
	}
	return false;
}

//When we get the notice from the server that the song is stopped
function songStopped() {
	//Stop the progress timer
	if (MyBox.playingTimer.id!==false) {
		clearInterval(MyBox.playingTimer.id);
	}
	//We need to change the icon to be 'start playing'
	document.getElementById("audioboxplaybutton").className='fa fa-play';
}
//Adjust the volume up
function volumeUp() {
	MyBox.Socket.emit("adjustVolume",'{"direction" : "up"}');
	return false;
}

//Adjust the volume down
function volumeDown() {
	MyBox.Socket.emit("adjustVolume",'{"direction" : "down"}');
	return false;
}

//In order to not take up a lot of space for the multiple select box of the crates
// we hide it and only show it when the crates button is pressed.
//It has a high z-index, so it overlays instead of taking up screen space.
function showCrates() {
	var crates=document.getElementById("audioboxcratepopup");
	//audioboxcratesbutton is the button bar that the crate button is in.
	// We display the multiselect box just to the right of that.
	var thebox= document.getElementById("audioboxcratesbutton").getBoundingClientRect();
	crates.style.top=thebox.top-1+"px";
	crates.style.left=thebox.right+2+"px";
	crates.className="show";	
	document.getElementById("audioboxcrates").focus();
	return false;
}
//Same process for the ratings drop down (though it isn't multi select)
function showRating() {
	var ratings=document.getElementById("audioboxratingpopup");
	//audioboxcratesbutton is the button bar that the rating button is in.
	// We display the select box just to the right of that.
	var thebox= document.getElementById("audioboxratingbutton").getBoundingClientRect();
	ratings.style.top=thebox.top-1+"px";
	ratings.style.left=thebox.right+2+"px";
	ratings.className="show";
	document.getElementById("audioboxrating").focus();
	return false;
}
//When they cancel out of the Rating display
function cancelRatingChange() {
	var ratings=document.getElementById("audioboxratingpopup");
	ratings.className="hide";
	return false;
}
//When they cancel out of the Crates display
function cancelCrateChange() {
	var crates=document.getElementById("audioboxcratepopup");
	crates.className="hide";
	return false;
}
//When they make a change to the crates list.
function saveCrateChange() {
	//Then get the selected crate IDs
	var optionslist = document.getElementById("audioboxcrates").options;
	//The [0] option has the track id (since it is 'none')
	var selectedIDs = [optionslist[0].value];
	var cnt=optionslist.length;
	var i;
	if (optionslist[0].selected) {
		//If the 'none' is selected - we want to make sure that all the others are off
		//Maybe we should do this in an 'on change'?
		for (i=1; i<cnt; i++) {
			optionslist[i].selected=false;
		}
	} else {
		//Otherwise, collect those that are selected (skip [0])
		for (i=1; i<cnt; i++) {
			if (optionslist[i].selected) {
				selectedIDs.push(optionslist[i].value);
			}
		}
	}
	MyBox.Socket.emit("cratesChanged",JSON.stringify(selectedIDs));
	document.getElementById("audioboxcrates").blur();
	return false;
}
//When they change the rating for a song
function ratingChanged() {
	var el= document.getElementById("audioboxrating");
	MyBox.Socket.emit("ratingChanged",'{"id":"'+el.options[0].value+'","rating":"'+el.selectedIndex+'"}');
	//Hide the box
	var ratings=document.getElementById("audioboxratingpopup");
	ratings.className="hide";
}
//Clear out the 'currently playing' 'stuff' because the playlist was replaced
function clearCurrentPlaying(msg) {
	//Kill the timer first...
	if (MyBox.playingTimer.id!==false) {
		clearInterval(MyBox.playingTimer.id);
		MyBox.playingTimer.id=false;
	}
	document.getElementById("audioboxsongprogress").value=0;
	document.getElementById("audioboxsongprogress").max=0;
	MyBox.playingTimer.value=0;
	MyBox.playingTimer.max=0;
	MyBox.playingTimer.rowid="";
	document.getElementById("audioboxsongtitle").innerHTML="No song playing";
	document.getElementById("audioboxsongseconds").innerHTML="0.00";
	//Set time left to 0.00
	document.getElementById("audioboxPLTotal").innerHTML="0.00";
	//We need to change the icon to be 'start playing'
	document.getElementById("audioboxplaybutton").className='fa fa-play';
}

//We get this when the server hears that LiquidSoap as actually started playing a song
function songStarted(msg) {
	var data=playlists=JSON.parse(msg);
	document.getElementById("audioboxsongtitle").innerHTML=data.title;
	document.getElementById("audioboxsongseconds").innerHTML=formatTimes(data.duration);
	var options=document.getElementById("audioboxrating").options
	options[0].value=data.track_id;				//We save the library id of the track in the options[0] value,
												// since the selectedIndex will be the rating value anyway.
	var i;
	var cnt=options.length;
	var optionselected;
	for (i=0; i<cnt; i++) {
		if (data.rating==i) {
			options[i].selected=true;
		} else {
			options[i].selected=false;
		}
	}
	//We also need to request the crates for this song.
	MyBox.Socket.emit("getSongCrates",'{"track_id":"'+data.track_id+'"}');
	if (MyBox.playingTimer.rowid=="p"+data.songId) {
		//The song hasn't changed.. just the times - we only need to set a new 'value'
		document.getElementById("audioboxsongprogress").value=MyBox.playingTimer.max-data.duration;
		MyBox.playingTimer.value=MyBox.playingTimer.max-data.duration;
	} else {
		//New song.. all new information
		//Stop the current timer if there is one running
		if (MyBox.playingTimer.id!==false) {
			clearInterval(MyBox.playingTimer.id);
		}
		document.getElementById("audioboxsongprogress").value=0;
		document.getElementById("audioboxsongprogress").max=data.duration;
		MyBox.playingTimer.value=0;
		MyBox.playingTimer.max=data.duration;
		MyBox.playingTimer.rowid="p"+data.songId;
		MyBox.playingTimer.id=setInterval(movePlayingSlider,1000);
	}
	//Turn off highlight for the previous one (if any)
	var playing = document.getElementsByClassName("audioboxDivRowPlaying");
	var classes;
	cnt=playing.length;
	for (i=0; i<cnt; i++) {
		//Get the current class list
		classes=playing[i].className;
		//NOTE: probably not necessary, but we remove the space we inserted, not just the class
		playing[i].className = classes.replace(" audioboxDivRowPlaying","");
	}
	//And highlight the row currently playing
	playing=document.getElementById(MyBox.playingTimer.rowid);
	//NOTE: There may be a number of reasons that the currently playing song isn't in the playlist
	if (playing) {
		classes=playing.className;
		//Note that we add the space in front here
		playing.className=classes+" audioboxDivRowPlaying";
	}
	document.title = "AudioBox: "+data.title+"/"+data.artist;
	//Change the play/pause button to a pause now that we are playing.
	document.getElementById("audioboxplaybutton").className="fa fa-pause";
	return false;
}

//Start playing at the song previous to the currently playing song
function skipBackward() {
	MyBox.Socket.emit('doSkip','{"direction" : "-"}');
	return false;
}

//Start playing at the song next in the playlist
function skipForward() {
	MyBox.Socket.emit('doSkip','{"direction" : "+"}');
	return false;
}

//Move the slider for the currently playing song
function movePlayingSlider() {
	MyBox.playingTimer.value++;
	if (MyBox.playingTimer.value>MyBox.playingTimer.max) {
		clearInterval(MyBox.playingTimer.id);
		MyBox.playingTimer.id=false;
		document.getElementById("audioboxPLTotal").innerHTML="00:00";
	} else {
		document.getElementById("audioboxsongprogress").value=MyBox.playingTimer.value;
		document.getElementById("audioboxsongseconds").innerHTML=formatTimes(MyBox.playingTimer.max-MyBox.playingTimer.value);
	}
}

//When the server has retrieved the crate information for the currently playing song
function songCrates(msg) {
	var isSelected=JSON.parse(msg);
	var options=document.getElementById("audioboxcrates").options
	//The first entry returned is the track id - and we put that as the value for options[0]
	options[0].value=isSelected.shift();
	var i;
	var ol=options.length;
	var optionselected;
	//Start the loop at 1 because option [0] is 'none'
	// NOTE: we go through the whole options list, even if there are no crates returned
	//       because we want to make sure everything is 'unselected'
	for (i=1; i<ol; i++) {
		if (isSelected.indexOf(Number(options[i].value))<0) {
			options[i].selected=false;
		} else {
			options[i].selected=true;
		}
	}
	//If we only get the track id, then the 'none' option is selected (we turned the rest off above)
	if (isSelected.length==0) {
		options[0].selected=true;
	} else {
		//If we have some, then we need to make sure that 'none' is NOT selected
		options[0].selected=false;
	}
	//Make sure the select is hidden
	document.getElementById("audioboxcratepopup").className="hide";
	return false;
}

//When we get the list of available crates to put a song into
function gotCratesList(msg) {
	//The option VALUE is the crate ID.
	// Option 0 is special - we will put the track id as the value for that option when a song starts playing
	crates=JSON.parse(msg);
	//NOTE: It is possible that we will get a new set of crates while a song is currently playing.
	//      So need to preserve the current selections.
	var audioboxcrates=document.getElementById("audioboxcrates");
	var options=audioboxcrates.options;
	var i;
	var cl=options.length;
	var areSelected=[];
	for (i=0; i<cl; i++) {
		if (options[i].selected) {
			areSelected.push(options[i].value);
		}
	}	
	cl=crates.length;
	options='<option value="0">--None--</option>';
	for (i=0; i<cl; i++) {
		options+='<option ';
		if (areSelected.indexOf(crates[i][0])>=0) {
			options+="selected ";
		}
		options+='value="'+crates[i][0]+'">'+crates[i][1]+'</option>';
	}
	audioboxcrates.innerHTML=options;
	audioboxcrates.size=cl+1;
	return false;
}

//Check for a return from the search field and send off the search request when they hit return
function checkForCR() {
	if (event.keyCode==13) {
		var request={};
		request.term=document.getElementById("audioboxsrchWords").value;
		request.type=document.getElementById("audioboxsrchFor").value;	
		MyBox.Socket.emit('doSearch',JSON.stringify(request));
		return false;
	}
	return true;
}

//When they hit the Save Playlist button - we need to request the list of playlists so that they can choose an existing one
function savePlaylist() {
	MyBox.Socket.emit('getPlaylistNames','');
	return false;
}
//Return from getting the list of playlists we currently have.
function gotPlaylists(msg) {
	var playlists=JSON.parse(msg);
	var cnt=playlists.length;
	var theRows='';
	var rowTemplate=
		"<div class='audioboxDivRow'><div class='audioboxPLName'>pl0lp</div><div class='audioboxPLInfo'><ul class='button-bar audioboxRight'><li><a href='#' class='tooltip' title='Load' onclick='return doLoadPlaylist(pl3lp);'><i class='fa fa-download'></i> </a></li><li><a href='#' class='tooltip' title='Songs'>pl1lp</a></li><li><a href='#' class='tooltip' title='Time'>pl2lp</a></li><li><a href='#' class='tooltip' title='Review' onclick='return getForReview(pl3lp)'><i class='fa fa-folder-open'></i> </a></li></ul></div></div>";
	for (i=0; i<cnt; i++) {
		if ((i%2)==0) {
			aRow=rowTemplate;
		} else {
			aRow=rowTemplate.replace(/audioboxDivRow/,"audioboxDivRowAlt");
		}
		aRow=aRow.replace(/pl0lp/g,playlists[i][0]);
		aRow=aRow.replace(/pl1lp/g,playlists[i][1]);
		aRow=aRow.replace(/pl2lp/g,formatTimes(playlists[i][2]));
		theRows+=aRow.replace(/pl3lp/g,playlists[i][3]);
	}
	document.getElementById("audioboxRightSide").innerHTML=theRows;
	return false;
}
//Return from getting the list of crates we currently have
function gotCratesListReview(msg) {
	var crates=JSON.parse(msg);
	var cnt=crates.length;
	var theRows='';
	//[rows[i].id, rows[i].name, rows[i].count]
	var rowTemplate=
		"<div class='audioboxDivRow'><div class='audioboxPLName'>cr0rc</div><div class='audioboxPLInfo'><ul class='button-bar audioboxRight'><li><a href='#' class='tooltip' title='Songs'>cr1rc</a></li><li><a href='#' class='tooltip' title='Review' onclick='return getCrateForReview(cr2rc)'><i class='fa fa-folder-open'></i> </a></li></ul></div></div>";
	for (i=0; i<cnt; i++) {
		if ((i%2)==0) {
			aRow=rowTemplate;
		} else {
			aRow=rowTemplate.replace(/audioboxDivRow/,"audioboxDivRowAlt");
		}
		aRow=aRow.replace(/cr0rc/g,crates[i][1]);
		aRow=aRow.replace(/cr1rc/g,crates[i][2]);
		theRows+=aRow.replace(/cr2rc/g,crates[i][0]);
	}
	document.getElementById("audioboxRightSide").innerHTML=theRows;
	return false;
	
}
//When they hit the button to load the playlist into the leftside
function doLoadPlaylist(listid) {
	//We only need to send the ID we want to copy over to the 'current' list
	MyBox.Socket.emit('replaceCurrentList','{"withID" : "'+listid+'"}');
	return false;
}
//Coming back with the list of playlist names so we can let them pick a name for the save.
function gotPlaylistNames(msg) {
	playlists=JSON.parse(msg);
	var cnt=playlists.length;
	var theRows="<div class='audioboxDivRowAlt'><input id='audioboxNewPlaylist' type='text' placeholder='New Playlist Name' value='' size='30'/><select id='audioboxOldPlaylists' onchange='pickedOld();'><option value='0'>--Choose--</option>";
	for (i=0; i<cnt; i++) {
		theRows+="<option value='"+playlists[i]+"'>"+playlists[i]+"</option>";
	}
	theRows+="</select><button id='audioboxSaveButton' class='small audioboxRight' onclick='doSavePlaylist();'>Save</button></div>";
	document.getElementById("audioboxRightSide").innerHTML=theRows;
	return false;
}
//They picked an old name for the 'save' name...
function pickedOld() {
	document.getElementById("audioboxNewPlaylist").value=document.getElementById("audioboxOldPlaylists").value;
	document.getElementById("audioboxSaveButton").innerHTML="Replace";
}
//When they hit the save button after typing in or picking a new playlist name...
function doSavePlaylist() {
	//Get the name they entered.
	var listname=document.getElementById("audioboxNewPlaylist").value;
	//Check to see if they are using an existing name and grandmother it if so.
	var checkOlds=document.getElementById("audioboxOldPlaylists").options;
	var cnt=checkOlds.length;
	for (i=0; i<cnt; i++) {
		if (checkOlds[i].value==listname) {
			if (!confirm ("Do you really want to replace:"+checkOlds[i].value)) {
				return false;
			}
		}
	}
	//That's all we need to send off to the server - it copies 'current' to the name.
	//We don't bother sending anything back (we didn't change anything really)
	MyBox.Socket.emit('saveCurrentList','{"named" : "'+listname+'"}');
	//Clear out the save box so they don't try again.
	document.getElementById("audioboxRightSide").innerHTML="<div class='audioboxDivRow'>&nbsp;</div>";
	return false;
}
//When they ask to create a new Crate
function createCrate() {
	var theRow="<div class='audioboxDivRowAlt'><input id='audioboxNewCrate' type='text' placeholder='New Crate Name' value='' size='30'/><button class='small audioboxRight' onclick='doCreateCrate();'>Create</button></div>";
	document.getElementById("audioboxRightSide").innerHTML=theRow;
	return false;
}
//When they hit the save button after typing in new crate name...
function doCreateCrate() {
	//Get the name they entered.
	var cratename=document.getElementById("audioboxNewCrate").value;
	//They cannot create the same name twice
	var checkOlds=document.getElementById("audioboxcrates").options;
	var cnt=checkOlds.length;
	for (i=0; i<cnt; i++) {
		if (checkOlds[i].value==cratename) {
			if (alert ("A crate named:"+checkOlds[i].value+" already exists")) {
				return false;
			}
		}
	}
	//That's all we need to send off to the server.
	//The server will send us a new set of crate names.
	MyBox.Socket.emit('createCrate','{"named" : "'+cratename+'"}');
	//Clear out the save box so they don't try again
	document.getElementById("audioboxRightSide").innerHTML="<div class='audioboxDivRow'>&nbsp;</div>";
	return false;
}

//We have just received a list of all the songs in the current playlist
function gotCurrentSonglist(msg) {
	var songlist=JSON.parse(msg);
	if (songlist.errormsg) {
		alert("Get list failed:"+songlist.errormsg);
		return false;
	}
	var cnt=songlist.length;
	var theRows='';
	var totaltime=0;
	MyBox.Playlist={};	//Clear out the old playlist information
	//NOTE: The id=slRls does not have quotes because it will be replaced by the ID in double quotes
	//      This is necessary because the playMe() is already in single quotes and needs the string in quotes to pass
	var rowTemplate;
	rowTemplate=
		"<div class='audioboxDivRow audioboxDropRow' data-dd=slRls id='psl0ls'><div class='audioboxSongL tooltip' title='Album: sl2ls' data-dd=slRls>sl3ls</div><div class='audioboxArtistL'>sl1ls</div><div class='audioboxInfoL'><ul class='button-bar audioboxRight'><li><a href='#' class='audioboxNowrap tooltip' title='Listen Local' onclick='return playMe(slRls);'><i class='fa fa-volume-up'></i>&nbsp;slFls</a></li><li><a href='#' class='audioboxNowrap tooltip' title='Remove' onclick='return removeMe(slRls);'><i class='fa fa-trash'></i> </a></li><li><a href='#' class='audioboxNowrap tooltip' title='Play Next' onclick='return meNext(slRls);'><i class='fa fa-arrow-circle-up'></i></a></li></ul></div></div>";
	for (i=0; i<cnt; i++) {
		rowid='p'+songlist[i][0];	//Use playlist id as the data-dd we will use for this row
		songlist[i][1]=escapeHtml(songlist[i][1]);	//Artist
		songlist[i][2]=escapeHtml(songlist[i][2]);	//Album
		songlist[i][3]=escapeHtml(songlist[i][3]);	//Title
		//Playlist position,title,song id, playlist id
		MyBox.Playlist[rowid]=[songlist[i][4],songlist[i][3],songlist[i][8],songlist[i][0]];
		if ((i%2)==0) {
			aRow=rowTemplate;
		} else {
			aRow=rowTemplate.replace(/audioboxDivRow/,"audioboxDivRowAlt");
		}
		aRow=aRow.replace(/slRls/g,'"'+rowid+'"');		//We put the ID on the row - the row will be the drop target - the name will be the drop source
		aRow=aRow.replace(/sl0ls/g,songlist[i][8]);	//The song id
		aRow=aRow.replace(/sl1ls/g,songlist[i][1]);	//Artist
		aRow=aRow.replace(/sl2ls/g,songlist[i][2]);	//Album
		aRow=aRow.replace(/sl3ls/g,songlist[i][3]);	//Song Title
		aRow=aRow.replace(/slFls/g,formatTimes(songlist[i][7]));	//Formatted Duration/time
		//aRow=aRow.replace(/sl4ls/g,songlist[i][4]);	//Position in the playlist (unused)
		//aRow=aRow.replace(/sl5ls/g,songlist[i][5]);	//Playlist name (unused)
		//aRow.replace(/sl6ls/g,songlist[i][6]);	//Trackid
		theRows+=aRow;
		totaltime+=parseInt(songlist[i][7]);						//Add to total run time
	}
	document.getElementById("audioboxPLTotal").innerHTML=formatTimes (totaltime);
	//We add a 'dummy' row at the end so there is always something in the table, and they can add stuff to the end (since we add 'before' the row they drop on
	theRows+="<div class='";
	//Check if the last row needs to be 'alt' or normal
	if ((cnt%2)!=0) {
		theRows+="audioboxDivRowAlt ";
	}		 
	theRows+="audioboxDropRow' data-dd='Pdummy'>Drop songs here to add to the end of the list.</div>";
	MyBox.Playlist['Pdummy']=[0,0,0,'atEnd'];
	document.getElementById("audioboxLeftSide").innerHTML=theRows;
	var el;
	//Set up the rows as drop targets
	var links = document.getElementsByClassName('audioboxDropRow');
	cnt=links.length;
	for (i=0; i<cnt; i++) {
		el = links[i];
		el.addEventListener('dragover', function (e) {
			//Don't allow dropping on top of the same row.
			if (this.getAttribute("data-dd")!=e.dataTransfer.getData('Text')) {
				if (e.preventDefault) e.preventDefault(); 	// allows us to drop
				this.style.borderTopWidth="5px"		//We want to show that they can drop and that the new one will go 'before'
				e.dataTransfer.dropEffect = 'copy';
			}
			return false;
		});
		el.addEventListener('dragleave', function () {
			this.style.borderTopWidth="0px";
		});
		el.addEventListener('drop', function (e) {
			if (e.stopPropagation) e.stopPropagation(); // stops the browser from redirecting...why???
			var info = e.dataTransfer.getData('Text') + ' - ' + this.getAttribute("data-dd");
			this.style.borderTopWidth="0px";
			//alert('Here is the info:' + info);
			//We will be inserting in front of 
			var objidx=this.getAttribute("data-dd");
			var infrontof=MyBox.Playlist[objidx][3];
			var objidx=e.dataTransfer.getData('Text');
			var fromtype=objidx.substring(0,1);
			//This might come from either the current playlist, OR the search or review lists
			if (fromtype=='s') {
				//For the search result list, we need the trackID
				frominfo=MyBox.Searchlist[objidx][0];
			} else {
				//For the playlist result list, we need the playlisttrack ID
				frominfo=MyBox.Playlist[objidx][3];
			}
			//beforethis,movethis,dothistype,event
			MyBox.Socket.emit('updatePlaylist','{"dothistype" : "'+fromtype+'","beforethis" : "'+infrontof+'","movethis" : "'+frominfo+'"}');
			return false;
		});
	}
	//Set up the song titles as drop sources
	var links = document.getElementsByClassName('audioboxSongL');
	cnt=links.length;
	for (i=0; i<cnt; i++) {
		el = links[i];
		el.setAttribute('draggable', 'true');
		el.addEventListener('dragstart', function (e) {
			e.dataTransfer.effectAllowed = 'copy'; 			// only dropEffect='copy' will be dropable
			e.dataTransfer.setData('Text', this.getAttribute("data-dd")); 	// Need to know the source when it is dropped
		});
	}
	//And highlight the row currently playing
	playing=document.getElementById(MyBox.playingTimer.rowid);
	//NOTE: There may be a number of reasons that the currently playing song isn't in the playlist
	if (playing) {
		classes=playing.className;
		//Note that we add the space in front here
		playing.className=classes+" audioboxDivRowPlaying";
	}

	return false;
}
//Load the songs from the crate into the right side to be reviewed
function getCrateForReview(cid) {
	MyBox.Socket.emit('getCrateForReview','{"cid" : "'+cid+'"}');
	return false;
	
}
//Load the songs from the playlist into the right side to be reviewed (allow load of the whole playlist, or drag/drop songs)
function getForReview(plid) {
	MyBox.Socket.emit('getForReview','{"plid" : "'+plid+'"}');
	return false;
}
//Return from getting a list of songs from a playlist to review (handle these the same as we would from a 'search')
function gotReviewList(msg) {
	var songlist=JSON.parse(msg);
	cnt=songlist.length;
	theRows='';
	MyBox.Searchlist={};	//Clear out the old search information
	//NOTE: The id=slRls does not have quotes because it will be replaced by the ID in double quotes
	//      This is necessary because the playMe() is already in single quotes and needs the string in quotes to pass
	var rowTemplate=
		"<div class='audioboxDivRow'><div class='audioboxSongR tooltip' title='Album: sl2ls' data-dd=slRls>sl3ls</div><div class='audioboxArtistR'>sl1ls</div><div class='audioboxInfoR'><ul class='button-bar audioboxRight'><li class='first last'><a href='#' class='audioboxNowrap tooltip' title='Listen Local' onclick='return playMe(slRls);'><i class='fa fa-volume-up'></i>&nbsp;slFls</a></li></ul></div></div>";
	for (i=0; i<cnt; i++) {
		rowid='s'+i;	//Use the index as the data-dd we will use for this row
		songlist[i][1]=escapeHtml(songlist[i][1]);	//Artist
		songlist[i][2]=escapeHtml(songlist[i][2]);	//Album
		songlist[i][3]=escapeHtml(songlist[i][3]);	//Title
		//Trackid, title, runtime
		MyBox.Searchlist[rowid]=[songlist[i][6],songlist[i][3],songlist[i][7]];
		if ((i%2)==0) {
			aRow=rowTemplate;
		} else {
			aRow=rowTemplate.replace(/audioboxDivRow/,"audioboxDivRowAlt");
		}
		aRow=aRow.replace(/slRls/g,'"'+rowid+'"');		//We put the ID on the row - the row will be the drop target - the name will be the drop source
		//aRow=aRow.replace(/sl0ls/g,songlist[i][0]);	//The playlisttracks id (unused)
		aRow=aRow.replace(/sl1ls/g,songlist[i][1]);	//Artist
		aRow=aRow.replace(/sl2ls/g,songlist[i][2]);	//Album
		aRow=aRow.replace(/sl3ls/g,songlist[i][3]);	//Song Title
		aRow=aRow.replace(/slFls/g,formatTimes(songlist[i][7]));	//Formatted Duration/time
		//aRow=aRow.replace(/sl4ls/g,songlist[i][4]);	//Position in the playlist (unused)
		//aRow=aRow.replace(/sl5ls/g,songlist[i][5]);	//Playlist name (unused)
		//aRow.replace(/sl6ls/g,songlist[i][6]);	//Trackid
		theRows+=aRow;
	}
	document.getElementById("audioboxRightSide").innerHTML=theRows;
	//Set up the song titles as drop sources
	var links = document.getElementsByClassName('audioboxSongR');
	cnt=links.length;
	for (i=0; i<cnt; i++) {
		el = links[i];
		el.setAttribute('draggable', 'true');
		el.addEventListener('dragstart', function (e) {
			e.dataTransfer.effectAllowed = 'copy'; 			// only dropEffect='copy' will be dropable
			e.dataTransfer.setData('Text', this.getAttribute("data-dd")); 	// Need to know the source when it is dropped
		});
	}
	return false;
}
//Set the source for the local audio and start it playing
function playMe(objidx) {
	//All I really need is the track id so I can get the location from the library table
	var trackinfo;
	//This might come from either the current playlist, OR the search or review lists
	if (objidx.substring(0,1)=='s') {
		trackinfo=MyBox.Searchlist[objidx];
	} else {
		trackinfo=MyBox.Playlist[objidx];
	}
	document.getElementById("audioboxLocalAudio").src="http://coder.vrtisworks.home:3000/loadSong/"+trackinfo[0];
	document.getElementById("audioboxlocaltitle").innerHTML=trackinfo[1];
	document.getElementById("audioboxlocalseconds").innerHTML=formatTimes(trackinfo[2]);
	var movethis=document.getElementById("audioboxlocalprogress");
	movethis.value=0;
	movethis.max=trackinfo[2];
	document.getElementById("audioboxLocalButton").className="fa fa-pause";
	document.getElementById("audioboxLocalAudio").play();
	return false;
}
function formatTimes (thetime) {
	var hh=Math.floor(thetime/3600);		//Hour part
	var ss=thetime-hh*3600;
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
		return hh+':'+mm+':'+ss;
	}
	return mm+':'+ss;
}
function moveslider(theaudio) {
	var movethis=document.getElementById("audioboxlocalprogress");
	movethis.value=theaudio.currentTime;
	document.getElementById("audioboxlocalseconds").innerHTML=formatTimes(Math.floor(theaudio.duration-theaudio.currentTime));
}

//Toggle the local play/pause button
function toggleLocal() {
	//Toggle the local play/pause button.
	var currently=document.getElementById("audioboxLocalButton").className;
	if (currently.indexOf("fa-pause")<0) {
		//We are paused.. so we want to start playing
		document.getElementById("audioboxLocalAudio").play();
		document.getElementById("audioboxLocalButton").className="fa fa-pause";
	} else {
		//We are playing.. so we want to pause
		document.getElementById("audioboxLocalAudio").pause();
		document.getElementById("audioboxLocalButton").className="fa fa-play";
	}
	return false;
}
//When one of the infrequently used options is picked
function optionPicked() {
	var opt=document.getElementById("audioboxlowuse").value;
	if (opt=="empty") {
		MyBox.Socket.emit("emptyCurrentList",'');
	}
	if (opt=="random") {
		MyBox.Socket.emit("randomList",'');
	}
	if (opt=="list") {
		MyBox.Socket.emit("getPlaylists",'');
	}
	if (opt=="create") {
		//Call this to put up the save button, etc.
		createCrate();
	}
	if (opt=="crates") {
		MyBox.Socket.emit("getCratesListReview",'');
	}
	//Reset selection back to 'options'
	document.getElementById("audioboxlowuse").selectedIndex=0; 
    return false;
}

//Remove the song from the list
function removeMe(objidx) {
	//The easy way to do this is just tell the server and get a new list
	MyBox.Socket.emit("removeFromList",'{"plid":"'+MyBox.Playlist[objidx][2]+'"}');
    return false;
}
//Make the song select the next one
function meNext(objidx) {
	//The easy way to do this is just tell the server and get a new list
	MyBox.Socket.emit("meNext",'{"plid":"'+MyBox.Playlist[objidx][2]+'"}');
    return false;
}

//This was taken from 'mustache' to escape HTLML
var entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };

  function escapeHtml (string) {
    return String(string).replace(/[&<>"'`=\/]/g, function fromEntityMap (s) {
      return entityMap[s];
    });
  }