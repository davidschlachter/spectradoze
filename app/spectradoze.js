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

if(/iP(hone|ad)/.test(window.navigator.userAgent)) {
    addEvent(window, "resize", resizeForIOS);
}

let drawable = document.getElementById("drawable");
let positions = getPositions();

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
        playAudio();
        savePositions();
    });
    // If the cursor exits the window, stop drawing and turn off audio
    addEvent(document, "mouseout", function (e) {
        e = e ? e : window.event;
        let from = e.relatedTarget || e.toElement;
        if (!from || from.nodeName == "HTML") {
            removeEvent(drawable, "mousemove", setHeight);
            if (drawable.onmousemove === null && window.audioCtx !== null) audioCtx.close();
            spectrum = getSpectrumData();
        }
    });
    addEvent(document.getElementById("play"), "click", playAudio);
    addEvent(document.getElementById("play"), "click", function() {
        savePositions();
        playAudio();
    });
    addEvent(document.getElementById("stop"), "click", function() {
        if (window.audioCtx) audioCtx.close();
    });
    
    //
    // Touch listeners
    //
    let supportsPassive = false;
    try {let opts = Object.defineProperty({}, 'passive', {get: function() {supportsPassive = true;}});
      window.addEventListener("testPassive", null, opts);
      window.removeEventListener("testPassive", null, opts);
    } catch (e) {}
    drawable.addEventListener('touchdown', function(event) {
        if (window.audioCtx !== null) audioCtx.close();
    }, supportsPassive ? { passive: true } : false);
    drawable.addEventListener('touchmove', function(event) {
        setHeight(event);
    }, supportsPassive ? { passive: true } : false);
    drawable.addEventListener('touchend', function(event) {
        spectrum = getSpectrumData();
        playAudio();
        savePositions();
    }, supportsPassive ? { passive: true } : false);

    //
    // Support iOS touch events, resize app to accomodate mobile Safari address bar
    //
    if (/iP(hone|ad)/.test(window.navigator.userAgent)) {
        addEvent(document.body, "touchstart", function() {
            if (window.audioCtx !== null) audioCtx.close();
        });
        resizeForIOS();
    }
    
    //
    // Load last curve from Web Storage
    //
    setSavedPositions();
}


//
// Generate and equalize audio based on the bar heights
//
const minfreq = 100.0;
const maxfreq = 20000.0;
const bandcount = 32;

function playAudio() {
    if (window.audioCtx !== null) audioCtx.close();
    window.audioCtx = new AudioContext;
    
    let edgefreqs = calculateEdgeFreqs(bandcount, minfreq, maxfreq);
    let spectrum = getSpectrumData();

    const noiseLength = 30; // seconds
    const bufferSize = audioCtx.sampleRate * noiseLength; // Chromadoze uses 8192 and 65536 samples, see SampleGeneratorState
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    
    let data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }

    let noise = audioCtx.createBufferSource();
    noise.loop = true;
    noise.buffer = buffer;
    noise.start();

    let equalizers = new Array();
    let low = 0; // The low, mid, and high frequencies in a given band
    let high= 0;
    let mid = 0;
    for (let i = 0; i < bandcount; i++) { // Create 32 equalizers according to the calculated band frequencies
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
    let edgefreqs = new Array();
    let range = maxfreq / minfreq;
    for (let i = 0; i < bandcount; i++) {
        edgefreqs[i] = (minfreq * Math.pow(range, i / bandcount));
    }
    return edgefreqs;
};

function getSpectrumData() {
	let edgefreqs = calculateEdgeFreqs(bandcount, minfreq, maxfreq);
	let spectrum = new Array();
	let maxheight = document.querySelector("#drawable").clientHeight;
	// Value of each bar ranges from 0 to 1
	for (let i = 0; i < bandcount; i++) {
		let itemheight = document.querySelector("#d"+(i+1)+" > .down").clientHeight;
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
    let e = event;
    if (event && event.pageX) {e = event;} else {e = event.touches[0]}
    for (let i = 0; i < positions.length; i++) {
        if (e.pageX >= positions[i][4] && e.pageX <= positions[i][2]) {
            let frequencyBand = document.getElementById(positions[i][0]);
            let ypercent = (e.pageY-positions[i][1])/(positions[i][3] - positions[i][1]) * 100;
            if (ypercent >= 100) ypercent = 100;
            if (ypercent <= 0) ypercent = 0;
            let upper = document.querySelector("#"+frequencyBand.id+" > .up");
            upper.setAttribute("style","height:"+ypercent+"%");
            let lower = document.querySelector("#"+frequencyBand.id+" > .down");
            lower.setAttribute("style","height:"+(100.0-ypercent)+"%");
            break;
        }
    }
};

//
// Returns an array with position of each column, used
// to detect which column the mouse/drag is on
//
function getPositions() {
    let positions = new Array();

    let drawable = document.getElementById("drawable");
    let children = drawable.children;
    for (let i = 0; i < children.length; i++) {
     let singleChild = children[i];
     let a = singleChild.getBoundingClientRect();
     let b = new Array(singleChild.id, a.top, a.right, a.bottom, a.left);
     positions.push(b);
    }
    
    return positions;
}

//
// Adjust dimensions to accomodate mobile Safari address bar
//
function resizeForIOS() {
    let height = document.documentElement.clientHeight;
    let outheight = window.screen.height;
    let eightyfive = 0.85 * height;
    let nine = 0.09 * height;
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
    let positions = new Array();
    let drawable = document.getElementById("drawable");
    let children = drawable.children;
    for (let i = 0; i < children.length; i++) {
        let singleChild = children[i];
        let a = singleChild.getBoundingClientRect();
        let c = document.querySelector('#' + singleChild.id + ' > .down');
        let d = c.getBoundingClientRect();
        let b = Math.round(((d.bottom - d.top) / (a.bottom - a.top))*1000)/1000;
        positions.push(b);
    }
    return positions;
};
function loadPositions() {
    let retrievedObject = localStorage.getItem('savedPositions');
    if (retrievedObject === null) return null;
    return JSON.parse(retrievedObject);
};
function setSavedPositions() {
    let y = loadPositions();
    if (y === null) return;
    for (let i = 0; i < y.length; i++) {
        let ypercent = y[i]*100;
        if (ypercent >= 100) ypercent = 100;
        if (ypercent <= 0) ypercent = 0;
        let upper = document.querySelector("#d"+(i+1)+" > .up");
        upper.setAttribute("style","height:"+(100.0-ypercent)+"%");
        let lower = document.querySelector("#d"+(i+1)+" > .down");
        lower.setAttribute("style","height:"+(ypercent)+"%");
    }
};


// addEvent: written by Dean Edwards, 2005
// with input from Tino Zijdel - crisp@xs4all.nl
// http://dean.edwards.name/weblog/2005/10/add-event/
function addEvent(element,type,handler){if(element.addEventListener)element.addEventListener(type,handler,false);else{if(!handler.$$guid)handler.$$guid=addEvent.guid++;if(!element.events)element.events={};let handlers=element.events[type];if(!handlers){handlers=element.events[type]={};if(element["on"+type])handlers[0]=element["on"+type];element["on"+type]=handleEvent}handlers[handler.$$guid]=handler}}addEvent.guid=1;function removeEvent(element,type,handler){if(element.removeEventListener)element.removeEventListener(type,handler,false);else if(element.events&&element.events[type]&&handler.$$guid)delete element.events[type][handler.$$guid]}function handleEvent(event){event=event||fixEvent(window.event);let returnValue=true;let handlers=this.events[event.type];for(let i in handlers){if(!Object.prototype[i]){this.$$handler=handlers[i];if(this.$$handler(event)===false)returnValue=false}}if(this.$$handler)this.$$handler=null;return returnValue}function fixEvent(event){event.preventDefault=fixEvent.preventDefault;event.stopPropagation=fixEvent.stopPropagation;return event}fixEvent.preventDefault=function(){this.returnValue=false};fixEvent.stopPropagation=function(){this.cancelBubble=true};if(!window.addEventListener){document.onreadystatechange=function(){if(window.onload&&window.onload!=handleEvent){addEvent(window,"load",window.onload);window.onload=handleEvent}}}