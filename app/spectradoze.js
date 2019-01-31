//     SpectraDoze is a noise generator for the web.
//     Copyright (C) 2019  David Schlachter
// 
//     This program is free software: you can redistribute it and/or modify
//     it under the terms of the GNU General Public License as published by
//     the Free Software Foundation, either version 3 of the License, or
//     (at your option) any later version.
// 
//     This program is distributed in the hope that it will be useful,
//     but WITHOUT ANY WARRANTY; without even the implied warranty of
//     MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//     GNU General Public License for more details.
// 
//     You should have received a copy of the GNU General Public License
//     along with this program.  If not, see <https://www.gnu.org/licenses/>.

window.onload = startup; // Set up event handlers

// Store the last coordinates used in chart painting
window.setHeightDelta = new Array();
window.setHeightDelta[0] = 0;
window.setHeightDelta[1] = 0;
window.lastPosition = [-1, -1, -1, -1];

// Initialize error tolerance (px) for drawing
var tolerance = 0.0;
var positions = getPositions();

if(/iP(hone|ad)/.test(window.navigator.userAgent)) {
    addEvent(window, "resize", resizeForIOS);
} else {
    addEvent(window, "resize", function(e) {
        positions = getPositions();
        tolerance = Math.abs(positions[0][4] - positions[0][2]) / 4;
    });
}

var drawable = document.getElementById("drawable");


// Set up Web Audio API
var AudioContext = window.AudioContext || window.webkitAudioContext || false; 
if (AudioContext) {
    window.audioCtx = new AudioContext;
} else {
    alert("Sorry, but the Web Audio API is not supported by your browser.");
}

//
// Add event listeners and load state on page load
//
function startup() {  
    //
    // Mouse listeners
    //
    addEvent(drawable, "mousedown", function() {
        positions = getPositions();
        addEvent(drawable, "mousemove", setHeight);
    });
    addEvent(drawable, "mouseup", function() {
        removeEvent(drawable, "mousemove", setHeight);
        spectrum = getSpectrumData();
        window.lastPosition = [-1, -1, -1, -1];
        playAudio();
        
    });
    // If the cursor exits the window, stop drawing and turn off audio
    addEvent(document, "mouseout", function (e) {
        e = e ? e : window.event;
        var from = e.relatedTarget || e.toElement;
        if (!from || from.nodeName == "HTML") {
            removeEvent(drawable, "mousemove", setHeight);
            window.lastPosition = [-1, -1, -1, -1];
            spectrum = getSpectrumData();
        }
    });
    addEvent(document.getElementById("play"), "click", function() {
        playAudio();
    });
    addEvent(document.getElementById("stop"), "click", function() {
        if (window.audioCtx) audioCtx.close();
    });
    
    //
    // Touch listeners
    //
    addEvent(drawable, "touchstart", function (e) {
        if (window.audioCtx !== null) audioCtx.close();
        positions = getPositions();
        e.preventDefault();
    });
    addEvent(drawable, "touchmove", function (e) {
        setHeight(e);
        e.preventDefault();
    });
    addEvent(drawable, "touchend", function (e) {
        spectrum = getSpectrumData();
        playAudio();
        e.preventDefault();
    });

    //
    // Support iOS touch events, resize app to accomodate mobile Safari address bar
    //
    if (/iP(hone|ad)/.test(window.navigator.userAgent)) {
        resizeForIOS();
    }
    
    //
    // Set the tolerance for DOM updates
    //
    tolerance = Math.abs(positions[0][4] - positions[0][2]) / 4;
    
    //
    // Load last curve from Web Storage
    //
    setSavedPositions();
}


//
// Generate and equalize audio based on the bar heights
//
var minfreq = 100.0;
var maxfreq = 20000.0;
var bandcount = 32;

function playAudio() {
    savePositions();
    
    if (window.audioCtx !== null) audioCtx.close();
    window.audioCtx = new AudioContext;
    
    var edgefreqs = calculateEdgeFreqs(bandcount, minfreq, maxfreq);
    var spectrum = getSpectrumData();

    var noiseLength = 30; // seconds
    var bufferSize = audioCtx.sampleRate * noiseLength; // Chromadoze uses 8192 and 65536 samples, see SampleGeneratorState
    var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    var noise = audioCtx.createBufferSource();
    noise.loop = true;
    noise.buffer = buffer;
    noise.start();

    var equalizers = new Array();
    var low = 0; // The low, mid, and high frequencies in a given band
    var high= 0;
    var mid = 0;
    for (var i = 0; i < bandcount; i++) { // Create 32 equalizers according to the calculated band frequencies
        equalizers[i] = audioCtx.createBiquadFilter();
        equalizers[i].type = "peaking"; // https://developer.mozilla.org/en-US/docs/Web/API/BiquadFilterNode/type
        equalizers[i].frequency.value = edgefreqs[i];
        low = edgefreqs[i];
        if (i == bandcount - 1) {
            high = maxfreq;
        } else {
            high = edgefreqs[i+1]
        }
        mid = ((high - low)/2) + low;
        equalizers[i].Q.value = mid / (high - low);
        equalizers[i].gain.value = spectrum[i];
        if (i == 0) {
            noise.connect( equalizers[i] );
        } else {
            equalizers[i - 1].connect( equalizers[i] );
        }
    }
    equalizers[31].connect(audioCtx.destination);
}

function calculateEdgeFreqs(bandcount, minfreq, maxfreq) {
    var edgefreqs = new Array();
    var range = maxfreq / minfreq;
    for (var i = 0; i < bandcount; i++) {
        edgefreqs[i] = (minfreq * Math.pow(range, i / bandcount));
    }
    return edgefreqs;
};

function getSpectrumData() {
	var edgefreqs = calculateEdgeFreqs(bandcount, minfreq, maxfreq);
	var spectrum = new Array();
	var maxheight = document.querySelector("#drawable").clientHeight;
	// Value of each bar ranges from 0 to 1
	for (var i = 0; i < bandcount; i++) {
		var itemheight = document.querySelector("#d"+(i+1)+" > .down").clientHeight;
		spectrum[i] = (itemheight / maxheight);
        // Scaled between -8 and 8 (dB)
        spectrum[i] = ((spectrum[i] * 2) - 1 ) * 8;
	}
	return spectrum;
};


//
// Sets height of bars as user drags across drawable
//
function setHeight(event) {
    var e = event;
    if (event && event.pageX) {e = event;} else {e = event.touches[0]}
    
    if (window.setHeightDelta[0] == 0 && window.setHeightDelta[1] == 0) {
        window.setHeightDelta[0] = e.pageX;
        window.setHeightDelta[1] = e.pageY;
    }

    var xdiff = Math.abs(e.pageX - window.setHeightDelta[0]);
    var ydiff = Math.abs(e.pageY - window.setHeightDelta[1]); 
    
    if (xdiff > tolerance || ydiff > tolerance) {
        window.setHeightDelta[0] = e.pageX;
        window.setHeightDelta[1] = e.pageY;
    } else {
        return;
    }
    
    for (var i = 0; i < positions.length; i++) {
        if (e.pageX >= positions[i][4] && e.pageX <= positions[i][2]) {
            var frequencyBand = document.getElementById(positions[i][0]);
            var ypercent = (e.pageY-positions[i][1])/(positions[i][3] - positions[i][1]) * 100;
            if (ypercent >= 100) ypercent = 100;
            if (ypercent <= 0) ypercent = 0;
            var upper = document.querySelector("#"+frequencyBand.id+" > .up");
            upper.setAttribute("style","height:"+ypercent+"%");
            var lower = document.querySelector("#"+frequencyBand.id+" > .down");
            lower.setAttribute("style","height:"+(100.0-ypercent)+"%");
            // Detect bar skips: first two points
            if (window.lastPosition[0] === -1) {
                window.lastPosition[0] = i;
                window.lastPosition[1] = ypercent;
                break;
            }
            if (window.lastPosition[2] === -1) {
                window.lastPosition[2] = i;
                window.lastPosition[3] = ypercent;
                break;
            }
            // Detect bar skips: track changes
            window.lastPosition[0] = window.lastPosition[2];
            window.lastPosition[1] = window.lastPosition[3];
            window.lastPosition[2] = i;
            window.lastPosition[3] = ypercent;
            // Detect bar skips: did we skip columns?
            if (window.lastPosition[0] !== window.lastPosition[2]) { // changed columns
                if (Math.abs(window.lastPosition[0] - window.lastPosition[2]) > 1) { // skipped columns
                    var startIndex = Math.min(window.lastPosition[0], window.lastPosition[2]);
                    var endIndex = Math.max(window.lastPosition[0], window.lastPosition[2]);
                    for (var j = startIndex + 1; j < endIndex; j++) {
                        var frequencyBand = document.getElementById(positions[j][0]);
                        var upper = document.querySelector("#"+frequencyBand.id+" > .up");
                        var newYPercent = window.lastPosition[1] + (j - window.lastPosition[0]) * ((window.lastPosition[1] - window.lastPosition[3])/(window.lastPosition[0] - window.lastPosition[2]));
                        upper.setAttribute("style","height:"+newYPercent+"%");
                        var lower = document.querySelector("#"+frequencyBand.id+" > .down");
                        lower.setAttribute("style","height:"+(100.0-newYPercent)+"%");
                    }
                }
            }
            break;
        }
    }
};

//
// Returns an array with position of each column, used
// to detect which column the mouse/drag is on
//
function getPositions() {
    var positions = new Array();

    var drawable = document.getElementById("drawable");
    var children = drawable.children;
    for (var i = 0; i < children.length; i++) {
     var singleChild = children[i];
     var a = singleChild.getBoundingClientRect();
     var b = new Array(singleChild.id, a.top, a.right, a.bottom, a.left);
     positions.push(b);
    }
    
    return positions;
}

//
// Adjust dimensions to accomodate mobile Safari address bar
//
function resizeForIOS() {
    var height = document.documentElement.clientHeight;
    var outheight = window.screen.height;
    var eightyfive = 0.85 * height;
    var nine = 0.09 * height;
    document.querySelector("main").setAttribute("style","height:"+eightyfive+"px");
    document.querySelector("#drawable").setAttribute("style","height:"+eightyfive+"px");
    document.querySelector("header").setAttribute("style","max-height:"+nine+"px");
    document.querySelector("#banner").setAttribute("style","max-height:"+nine+"px");
    document.querySelector("#play").setAttribute("style","max-height:"+nine+"px");
    document.querySelector("#stop").setAttribute("style","max-height:"+nine+"px");
    document.querySelector("#info").setAttribute("style","max-height:"+nine+"px");
};

//
// Functions to save and load the curent curve with the Web Storage API
//
function savePositions() {
    localStorage.setItem('savedPositions', JSON.stringify(getPositionsForSave()));
};
function getPositionsForSave() {
    var positions = new Array();
    var drawable = document.getElementById("drawable");
    var children = drawable.children;
    for (var i = 0; i < children.length; i++) {
        var singleChild = children[i];
        var a = singleChild.getBoundingClientRect();
        var c = document.querySelector('#' + singleChild.id + ' > .down');
        var d = c.getBoundingClientRect();
        var b = Math.round(((d.bottom - d.top) / (a.bottom - a.top))*1000)/1000;
        positions.push(b);
    }
    return positions;
};
function loadPositions() {
    var retrievedObject = localStorage.getItem('savedPositions');
    if (retrievedObject === null) return null;
    return JSON.parse(retrievedObject);
};
function setSavedPositions() {
    var y = loadPositions();
    if (y === null) return;
    for (var i = 0; i < y.length; i++) {
        var ypercent = y[i]*100;
        if (ypercent >= 100) ypercent = 100;
        if (ypercent <= 0) ypercent = 0;
        var upper = document.querySelector("#d"+(i+1)+" > .up");
        upper.setAttribute("style","height:"+(100.0-ypercent)+"%");
        var lower = document.querySelector("#d"+(i+1)+" > .down");
        lower.setAttribute("style","height:"+(ypercent)+"%");
    }
};


// addEvent: written by Dean Edwards, 2005
// with input from Tino Zijdel - crisp@xs4all.nl
// http://dean.edwards.name/weblog/2005/10/add-event/
function addEvent(element,type,handler){if(element.addEventListener)element.addEventListener(type,handler,false);else{if(!handler.$$guid)handler.$$guid=addEvent.guid++;if(!element.events)element.events={};var handlers=element.events[type];if(!handlers){handlers=element.events[type]={};if(element["on"+type])handlers[0]=element["on"+type];element["on"+type]=handleEvent}handlers[handler.$$guid]=handler}}addEvent.guid=1;function removeEvent(element,type,handler){if(element.removeEventListener)element.removeEventListener(type,handler,false);else if(element.events&&element.events[type]&&handler.$$guid)delete element.events[type][handler.$$guid]}function handleEvent(event){event=event||fixEvent(window.event);var returnValue=true;var handlers=this.events[event.type];for(var i in handlers){if(!Object.prototype[i]){this.$$handler=handlers[i];if(this.$$handler(event)===false)returnValue=false}}if(this.$$handler)this.$$handler=null;return returnValue}function fixEvent(event){event.preventDefault=fixEvent.preventDefault;event.stopPropagation=fixEvent.stopPropagation;return event}fixEvent.preventDefault=function(){this.returnValue=false};fixEvent.stopPropagation=function(){this.cancelBubble=true};if(!window.addEventListener){document.onreadystatechange=function(){if(window.onload&&window.onload!=handleEvent){addEvent(window,"load",window.onload);window.onload=handleEvent}}}