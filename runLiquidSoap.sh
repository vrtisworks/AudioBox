#!/usr/bin/liquidsoap
# This is the basic LiquidSoap startup script.
# 1) It starts a blank source to a dummy output so that liquidsoap stays running
#    and doesn't use a lot of CPU looking for stuff to play
# 2) It creates two server commands:
#    audiobox.start - this will create the getNextSongFilename playlist and the output.alsa
#    audiobox.stop - this shuts down the playlist and the output
# The code is based on the dynamic playlist sample from the documentation

# Put the log file in some directory where you have permission to write.
#set("log.file.path","./liquidtesting.log")
# Turn off file logging during initial testing
set("log.file",false)
# Print log messages to the console,
set("log.stdout", true)
# Use the telnet server for requests while testing
set("server.telnet", true)
# Need to use external address to listen on, so we can talk from external
set("server.telnet.bind_addr","192.168.0.112")
# Don't time out the telnet server
set("server.timeout",-1.0)

# This will give liquidsoap something to do while we wait for the telnet commands
output.dummy(blank())

# First, we create a list referencing the the playlist and the output:
sourceAndoutput = ref []

# The currently playlist id
playingplid=ref "*"
# The most recently requested file (LiquidSoap requests the 'next' file before the current one ends)
requestedplid=ref "*"

# So we can change the volume
v = interactive.float("volume", 1.0)

# This runs as part of on_track so we can tell the browser 'exactly' when the track starts
def track_playingid(m) =
  # Grab the current filename when the track changes
  playingplid := m["theplid"]
  ignore(http.get("http://localhost:3000/songStarted/#{!playingplid}"))
end

# Our custom request function
def get_request() = 
  # Get the URI
  allhttp = http.get("http://localhost:3000/getNextSongFileName")
  uri = snd(allhttp)
  #We want to extract 'theplid' part that was just supplied
  stuff=string.split(separator=":",uri)
  stuff=string.split(separator="=",list.nth(stuff,1))
  requestedplid := list.nth(stuff,1)
  # Create a request
  request.create(uri)
end

# Create a function to create the playlist source and output it.
def create_playlist(ignore) =
  # The playlist source 
  s = request.dynamic(id="thelist",get_request)
  s = on_track(id="thelist",track_playingid,s)
  s = amplify(v, s)

  #The output device might have to change depending on your configuration
  output = output.alsa(id='localAudio', device="hw: ALSA",fallible=true,s)

  # Save the playlist and the output to the array
  sourceAndoutput := 
      list.append( [s,output],
                    !sourceAndoutput )
  "Created!"
end

# And a function to destroy the playlist and output we created
def destroy_playlist(ignore) = 
  list.iter(source.shutdown, !sourceAndoutput)
  # The list is now empty
  sourceAndoutput := []
  # Set the id to * because we are not playing anything
  playingplid := "*"
  requestedplid := "*"
  # And return
  "Gone!"
end

# This is the telnet command to output the current playlist id
def get_playlistId(ignore) =
	if !playingplid!='*' then 
		# NOTE: source.remaining might not be totally accurate, depending on when it is requested.
		#       If you ask before LiquidSoap has finished decoding the whole file, you get what is done so far,
		#       not what is actually remaining.. 
		"#{!playingplid},#{source.remaining(list.nth(!sourceAndoutput,0))},#{!requestedplid}"
	else
		"#{!playingplid},0,#{!requestedplid}"
	end
end

# Now we register the telnet commands:
server.register(namespace="audiobox",
                description="Start asking for songs to play.",
                usage="start ",
                "start",
                create_playlist)
server.register(namespace="audiobox",
                description="Stop asking for songs to play.",
                usage="stop ",
                "stop",
                destroy_playlist)
server.register(namespace="audiobox",
                description="Get the current playlist id.",
                usage="getid ",
                "getid",
                get_playlistId)
