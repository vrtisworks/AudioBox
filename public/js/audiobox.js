$( document ).ready(function() {
	//Set up all the event callbacks once.
	MyBox.Socket.on("gotCurrentSongList",gotSonglist);			//When we get the list of songs in the current playlist
	MyBox.Socket.on("gotPlaylists",gotPlaylists);				//When we get a list of playlists for the right side
	MyBox.Socket.on("savingPlaylist",savingPlaylist);			//When we the list of playlists as part of saving a playlist
	MyBox.Socket.on("gotReviewPlaylist",gotReviewPlaylist);		//When we get a list of songs in a playlist for the right side
	MyBox.Socket.on("songStarted",songStarted);					//When we are told LiquidSoap just started a song
	MyBox.Socket.on("songCrates",songCrates);					//When we get the list of crates that the playing song is part of
	MyBox.Socket.on("gotCratesList",gotCratesList);				//When we get the complete list of crates for the select list
	MyBox.Socket.on("getSongEvents",registerSongEvents);		//When we get the complete list of crates for the select list
	registerSongEvents();										//Send the song related events anyway
	//Ask for the list of crates available
	MyBox.Socket.emit("getCratesList",'{"event" : "gotCratesList"}');
	//Get the current playlist
	MyBox.Socket.emit('getCurrentPlaylist','{"event" : "gotCurrentSongList"}');
});
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
	//Refresh the selections, just in case they changed them.
	MyBox.Socket.emit("getSongCrates",'{"track_id":"'+document.getElementById("audioboxcrates").options[0].value+'","crateevent":"songCrates"}');
	return false;
}
//When they hit the save button on the crates list.
function saveCrateChange() {
	var crates=document.getElementById("audioboxcratepopup");
	//Hide the select containing div
	crates.className="hide";
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
//We are asked/told to register the song events we want when LiquidSoap starts to actually play a song
function registerSongEvents() {
	//Register callbacks we want to be used when a song is started (since that is driven by LiquidSoap talking to the server)
	MyBox.Socket.emit("registerSongEvents",'{"listevent" : "gotCurrentSongList","songevent" : "songStarted", "crateevent" : "songCrates"}');

}

//We get this when the server hears that LiquidSoap as actually started playing a song
function songStarted(msg) {
	var data=playlists=JSON.parse(msg);
	document.getElementById("audioboxsongtitle").innerHTML=data.title;
	document.getElementById("audioboxsongseconds").innerHTML=data.ftime;
	document.getElementById("audioboxsongprogress").value=0;
	document.getElementById("audioboxsongprogress").max=data.duration;
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
	//Need to start a timer every second to update the progress bar.
	if (MyBox.playingTimer!==false) {
		clearInterval(MyBox.playingTimer.id);
	}
	MyBox.playingTimer={
		"id" : setInterval(movePlayingSlider,1000),
		"value" : 0,
		"max" : data.duration
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
	playing=document.getElementById("p"+data.id);
	classes=playing.className;
	//Note that we add the space in front here
	playing.className=classes+" audioboxDivRowPlaying";
	document.title = "AudioBox: "+data.title+"/"+data.artist;
	return false;
}

//Move the slider for the currently playing song
function movePlayingSlider() {
	MyBox.playingTimer.value++;
	if (MyBox.playingTimer.value>MyBox.playingTimer.max) {
		clearInterval(MyBox.playingTimer.id);
		MyBox.playingTimer=false;
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
	}
	//NOTE: we do not display the list of crates when we load them.  Wait until the user wants to see them
	return false;
}

//When we get the list of available crates to put a song into
function gotCratesList(msg) {
	//The option VALUE is the crate ID.
	// Option 0 is special - we will put the track id as the value for that option when a song starts playing
	crates=JSON.parse(msg);
	var options='<option value="0">--None--</option>';
	var i;
	var cl=crates.length;
	for (i=0; i<cl; i++) {
		options+='<option value="'+crates[i][0]+'">'+crates[i][1]+'</option>';
	}
	document.getElementById("audioboxcrates").innerHTML=options;
	return false;
}

//Check for a return from the search field and send off the search request when they hit return
function checkForCR() {
	if (event.keyCode==13) {
		var request={};
		request.term=document.getElementById("audioboxsrchWords").value;
		request.type=document.getElementById("audioboxsrchFor").value;
		request.event='gotReviewPlaylist';		
		MyBox.Socket.emit('doSearch',JSON.stringify(request));
		return false;
	}
	return true;
}

//When they hit the Load Playlist button - we setup the option and request the list
function loadPlaylist() {
	MyBox.Socket.emit('getSavedLists','{"event" : "gotPlaylists"}');
	return false;
}
//When they hit the Save Playlist button - we need to request the list of playlists so that they can choose an existing one
function savePlaylist() {
	MyBox.Socket.emit('getSavedLists','{"event" : "savingPlaylist"}');
	return false;
}
//Return from getting the list of playlists we currently have.
function gotPlaylists(msg) {
	playlists=JSON.parse(msg);
	if (playlists.errormsg) {
		alert("Get Playlist list failed:"+playlists.errormsg);
		return false;
	}
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
		aRow=aRow.replace(/pl2lp/g,playlists[i][2]);
		theRows+=aRow.replace(/pl3lp/g,playlists[i][3]);
	}
	document.getElementById("audioboxRightSide").innerHTML=theRows;
	return false;
}
//When they hit the button to load the playlist into the leftside
function doLoadPlaylist(listid) {
	//We only need to send the ID we want to copy over to the 'current' list
	MyBox.Socket.emit('replaceCurrentList','{"withID" : "'+listid+'", "event" : "gotCurrentSongList"}');
	return false;
}
function savingPlaylist(msg) {
	playlists=JSON.parse(msg);
	if (playlists.errormsg) {
		alert("Get Playlist list failed:"+playlists.errormsg);
		return false;
	}
	var cnt=playlists.length;
	var theRows="<div class='audioboxDivRowAlt'><input id='audioboxNewPlaylist' type='text' placeholder='New Playlist Name' value='' size='30'/><select id='audioboxOldPlaylists' onchange='pickedOld();'><option value='0'>--Choose--</option>";
	for (i=0; i<cnt; i++) {
		theRows+="<option value='"+playlists[i][0]+"'>"+playlists[i][0]+"</option>";
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
	return false;
}
//We have just received a list of all the songs in the current playlist
function gotSonglist(msg) {
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
		"<div class='audioboxDivRow audioboxDropRow' data-dd=slRls id=slRls><div class='audioboxSongL tooltip' title='Album: sl2ls' data-dd=slRls>sl3ls</div><div class='audioboxArtistL'>sl1ls</div><div class='audioboxInfoL'><ul class='button-bar audioboxRight'><li><a href='#' class='audioboxNowrap tooltip' title='Listen Local' onclick='return playMe(slRls);'><i class='fa fa-volume-up'></i>&nbsp;sl4ls</a></li><li><a href='#' class='audioboxNowrap tooltip' title='Remove' onclick='return deleteMe(sl0ls);'><i class='fa fa-trash'></i> </a></li><li><a href='#' class='audioboxNowrap tooltip' title='Play Next' onclick='return meNext(sl0ls);'><i class='fa fa-arrow-circle-up'></i></a></li></ul></div></div>";
	for (i=0; i<cnt; i++) {
		rowid='p'+songlist[i][5];	//Use position as the ID we will use for this row
		//Trackid, title, duration (for local play), playlisttracks id
		//var ttime=songlist[i][4];
		//ttime=(ttime/60).toFixed(0)+":"+(ttime%60).toFixed(0);
		MyBox.Playlist[rowid]=[songlist[i][7],songlist[i][3],songlist[i][8],songlist[i][0]];
		if ((i%2)==0) {
			aRow=rowTemplate;
		} else {
			aRow=rowTemplate.replace(/audioboxDivRow/,"audioboxDivRowAlt");
		}
		aRow=aRow.replace(/slRls/g,'"'+rowid+'"');		//We put the ID on the row - the row will be the drop target - the name will be the drop source
		aRow=aRow.replace(/sl0ls/g,songlist[i][0]);	//The playlisttracks id
		aRow=aRow.replace(/sl1ls/g,songlist[i][1]);	//Artist
		aRow=aRow.replace(/sl2ls/g,songlist[i][2]);	//Album
		aRow=aRow.replace(/sl3ls/g,songlist[i][3]);	//Song Title
		aRow=aRow.replace(/sl4ls/g,songlist[i][4]);	//Duration/time
		//aRow=aRow.replace(/sl5ls/g,songlist[i][5]);	//Position in the playlist (unused)
		//aRow=aRow.replace(/sl6ls/g,songlist[i][6]);	//Playlist name (unused)
		theRows+=aRow.replace(/sl7ls/g,songlist[i][7]);	//Trackid
		totaltime+=parseInt(songlist[i][8]);						//Add to total run time
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
			MyBox.Socket.emit('updatePlaylist','{"dothistype" : "'+fromtype+'","beforethis" : "'+infrontof+'","movethis" : "'+frominfo+'","event" : "gotCurrentSongList"}');
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
	return false;
}
//Load the songs from the playlist into the right side to be reviewed (allow load of the whole playlist, or drag/drop songs)
function getForReview(plid) {
	MyBox.Socket.emit('getForReview','{"plid" : "'+plid+'","event" : "gotReviewPlaylist"}');
	return false;
}
//Return from getting a list of songs from a playlist to review (handle these the same as we would from a 'search')
function gotReviewPlaylist(msg) {
	var songlist=JSON.parse(msg);
	if (songlist.errormsg) {
		alert("Get list failed:"+songlist.errormsg);
		return false;
	}
	cnt=songlist.length;
	theRows="";
	MyBox.Searchlist={};	//Clear out the old search information
	//NOTE: The id=slRls does not have quotes because it will be replaced by the ID in double quotes
	//      This is necessary because the playMe() is already in single quotes and needs the string in quotes to pass
	var rowTemplate=
		"<div class='audioboxDivRow'><div class='audioboxSongR tooltip' title='Album: sl2ls' data-dd=slRls>sl3ls</div><div class='audioboxArtistR'>sl1ls</div><div class='audioboxInfoR'><ul class='button-bar audioboxRight'><li class='first last'><a href='#' class='audioboxNowrap tooltip' title='Listen Local' onclick='return playMe(slRls);'><i class='fa fa-volume-up'></i>&nbsp;sl4ls</a></li></ul></div></div>";
	for (i=0; i<cnt; i++) {
		rowid='s'+i;	//Use the index as the ID we will use for this row (can't use position)
		//Trackid, title, playlisttracks id,runtime
		MyBox.Searchlist[rowid]=[songlist[i][7],songlist[i][3],songlist[i][8]];
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
		aRow=aRow.replace(/sl4ls/g,songlist[i][4]);	//Duration/time
		//aRow=aRow.replace(/sl5ls/g,songlist[i][5]);	//Position in the playlist (unused)
		//aRow=aRow.replace(/sl6ls/g,songlist[i][6]);	//Playlist name (unused)
		theRows+=aRow.replace(/sl7ls/g,songlist[i][7]);	//Trackid
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
	var trackinfo;
	//This might come from either the current playlist, OR the search or review lists
	if (objidx.substring(0,1)=='s') {
		trackinfo=MyBox.Searchlist[objidx];
	} else {
		trackinfo=MyBox.Playlist[objidx];
	}
	document.getElementById("audioboxLocalAudio").src=MyBox.SiteURL+"loadSong/"+trackinfo[0];
	document.getElementById("audioboxlocaltitle").innerHTML=trackinfo[1];
	document.getElementById("audioboxlocalseconds").innerHTML=trackinfo[2];
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
	movethis.value=theaudio.currentTime/theaudio.duration*100.0;
}
function playLocal() {
	document.getElementById("audioboxLocalAudio").play();
	return false;
}
function pauseLocal() {
	document.getElementById("audioboxLocalAudio").pause();
	return false;
}
//Empty the current playlist (will get returned an empty list
function emptyCurrent() {
	MyBox.Socket.emit('emptyCurrentList','{"event" : "gotCurrentSongList"}');
    return false;
}//Delete the song from the list
function deleteMe(objidx) {
	//The easy way to do this is just tell the server and get a new list
	alert("Need to implement deleteMe");
	/*
	$.ajax ({
    	dataType: 'json',
        type: 'GET',
        url: MyBox.SiteURL+"ajaxRemoveItem/"+MyBox.Playlist[objidx][3],
        success: gotSonglist
    });
    */
    return false;
}
//Make the song select the next one
function meNext(objidx) {
	//The easy way to do this is just tell the server and get a new list
	alert("Need to implememnt meNext");
	/*
	$.ajax ({
    	dataType: 'json',
        type: 'GET',
        url: MyBox.SiteURL+"ajaxMakeNext/"+MyBox.Playlist[objidx][3],
        success: gotSonglist
    });
    */
    return false;
}
