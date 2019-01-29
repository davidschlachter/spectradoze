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


function startup() {
    var element = document.getElementById("drawable");
    
    var positions = getPositions();

    element.onmousedown = function(event) {
        element.addEventListener('onmousemove', setHeight);
        element.onmousemove = setHeight;
    };

    element.onmouseup = function() {
        document.removeEventListener('onmousemove', setHeight);
        spectrum = getSpectrumData();
        playAudio();
        element.onmousemove = null;
    };
    
    function setHeight(event) {
        for (var i = 0; i < positions.length; i++) {
            if (event.pageX >= positions[i][4] && event.pageX <= positions[i][2]) {
                var frequencyBand = document.getElementById(positions[i][0]);
                var ypercent = (event.pageY-positions[i][1])/(positions[i][3] - positions[i][1]) * 100;
                if (ypercent >= 100) ypercent = 100;
                if (ypercent <= 0) ypercent = 0;
                var upper = document.querySelector("#"+frequencyBand.id+" > .up");
                upper.setAttribute("style","height:"+ypercent+"%");
                var lower = document.querySelector("#"+frequencyBand.id+" > .down");
                lower.setAttribute("style","height:"+(100.0-ypercent)+"%");
                break;
            }
        }
    }
    document.getElementById("play").addEventListener("click", playAudio);
    document.getElementById("stop").addEventListener("click", function() {
        if (window.audioCtx) audioCtx.close();
    });

}

window.onload = startup;
window.onresize = startup;

function getPositions() {
    var positions = new Array();

    var element = document.getElementById("drawable");
    var children = element.children;
    for (var i = 0; i < children.length; i++) {
     var singleChild = children[i];
     var a = singleChild.getBoundingClientRect();
     var b = new Array(singleChild.id, a.top, a.right, a.bottom, a.left);
     positions.push(b);
    }
    
    return positions;
}


const minfreq = 100.0;
const maxfreq = 20000.0;
const bandcount = 32;

function calculateEdgeFreqs(bandcount, minfreq, maxfreq) {
    let edgefreqs = new Array();
    let range = maxfreq / minfreq;
    for (var i = 0; i < bandcount; i++) {
        edgefreqs[i] = (minfreq * Math.pow(range, i / bandcount));
    }
    return edgefreqs;
}
function getSpectrumData() {
	var edgefreqs = calculateEdgeFreqs(bandcount, minfreq, maxfreq);
	var spectrum = new Array();
	let maxheight = document.querySelector("#drawable").clientHeight;
	// Value of each bar ranges from 0 to 1
	for (var i = 0; i < bandcount; i++) {
		let itemheight = document.querySelector("#d"+(i+1)+" > .down").clientHeight
		spectrum[i] = (itemheight / maxheight);
		// Scaled to 0 to 1023
		// spectrum[i] = 0.001 * Math.pow(1000, spectrum[i]) * 1023;
        // Scaled between -24 and 24 (dB)
        spectrum[i] = ((spectrum[i] * 2) - 1 ) * 8;
	}
	return spectrum;
}


var AudioContext = window.AudioContext || window.webkitAudioContext || false; 
if (AudioContext) {
    window.audioCtx = new AudioContext;
} else {
    alert("Sorry, but the Web Audio API is not supported by your browser.");
}

function playAudio() {
    if (window.audioCtx) audioCtx.close();
    window.audioCtx = new AudioContext;
    
    let edgefreqs = calculateEdgeFreqs(bandcount, minfreq, maxfreq);
    let spectrum = getSpectrumData();
    //console.log("edgefreqs", edgefreqs);
    //console.log("spectrum", spectrum);
    

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
    let low = 0;
    let high= 0;
    let mid = 0;
    for (var i = 0; i < bandcount; i++) {
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
