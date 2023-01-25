(function(){
var movingpipe1, movingpipe2, movingpipe3, movingbird;
var birdpos = 200;
var gamerunning = false, gamescore = 0, bestscore = 0;
var clicked = false, unabled = false;
function setpipebox(pipeboxid){
    let ret = setInterval(function(){
        if(gamerunning){
            let pipebox = document.getElementById(pipeboxid);
            pipebox.style = "";
            setTimeout(function(){
                if(gamerunning){
                    let pos = Math.floor(Math.random() * 195);
                    pipebox.style.top = (pos - 281) + "px";
                    pipebox.style.animation = "pipemoving 2s linear forwards";
                    setTimeout(function(){
                        let R1 = pos + 40, L2 = R1 + 125, p = birdpos + 12.5;
                        if(gamerunning && (p <= R1 || L2 <= p)) gameover();
                        if(gamerunning) ++gamescore; else clearInterval(ret);
                    }, 1000);
                }
                else clearInterval(ret);
            }, 1000);
        }
    }, 3000);
    return ret;
}
function startpipemoving(){
    movingpipe1 = setpipebox("pipebox1");
    setTimeout(function(){
        if(gamerunning){
            movingpipe2 = setpipebox("pipebox2");
            setTimeout(function(){
                if(gamerunning) movingpipe3 = setpipebox("pipebox3");
            }, 1000);
        }
    }, 1000);
}
function stoppipemoving(){
    clearInterval(movingpipe1); movingpipe1 = undefined;
    clearInterval(movingpipe2); movingpipe2 = undefined;
    clearInterval(movingpipe3); movingpipe3 = undefined;
    let pipeboxes = document.getElementsByClassName("pipebox");
    for(let i = 0; i < pipeboxes.length; i++)
        pipeboxes[i].style.animationPlayState = "paused";
}
function startbirdmoving(){
    clicked = false;
    movingbird = setInterval(function(){
        if(gamerunning){
            let birdbox = document.getElementById("birdbox");
            birdbox.style.top = (birdpos = Math.max(0, Math.min(400 - 1, birdpos + (clicked ? -30: 30)))) + "px";
            birdbox.style.transform = clicked ? "rotate(-30deg)": "rotate(30deg)";
            clicked = false;
        }
    }, 200);
}
function stopbirdmoving(){
    clearInterval(movingbird); movingbird = undefined;
}
function gameover(){
    unabled = true;
    stopbirdmoving();
    stoppipemoving();
    gamerunning = false;
    document.getElementById("score").innerHTML = gamescore;
    document.getElementById("bestscore").innerHTML = (bestscore = Math.max(gamescore, bestscore));
    document.getElementById("board").style.display = "block";
    setTimeout(function(){unabled = false;}, 5000);
}
window.addEventListener("load", function(){
    document.getElementById("flappybird").addEventListener("click", function(){
        if(unabled) return;
        if(!gamerunning){
            let nodes = this.childNodes;
            for(let i = 0; i < nodes.length; i++)
                nodes[i].style = "";
            birdpos = 200;
            gamerunning = true; gamescore = 0; clicked = false;
            startpipemoving();
            startbirdmoving();
        }
        else{
            clicked = true;
        }
    });
});
})();