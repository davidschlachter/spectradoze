
function startup() {
    var element = document.getElementById("drawable");
    
    var positions = getPositions();

    element.onmousedown = function(event) {
        element.addEventListener('onmousemove', setHeight);
        element.onmousemove = setHeight;
    };

    element.onmouseup = function() {
        document.removeEventListener('onmousemove', setHeight);
        element.onmousemove = null;
    };
    
    function setHeight(event) {
        for (var i = 0; i < positions.length; i++) {
            if (event.pageX >= positions[i][4] && event.pageX <= positions[i][2]) {
                var frequencyBand = document.getElementById(positions[i][0]);
                var ypercent = (event.pageY-positions[i][1])/(positions[i][3] - positions[i][1]) * 100;
                console.log("ypercent: ", ypercent);
                var upper = document.querySelector("#"+frequencyBand.id+" > .up");
                upper.setAttribute("style","height:"+ypercent+"%");
                var lower = document.querySelector("#"+frequencyBand.id+" > .down");
                lower.setAttribute("style","height:"+(100.0-ypercent)+"%");
                break;
            }
        }
    }
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