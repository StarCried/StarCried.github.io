var movingpipe1, movingpipe2, movingbird;
var gamerunning = false, gamescore = 0, bestscore = 0;
var clicked = false;
function setpipebox(pipeboxid){
    let ret = setInterval(function(){
        let pipebox = document.getElementById(pipeboxid);
        pipebox.style.display = "none";
        pipebox.style.animation = "";
        setTimeout(function(){
            if(gamerunning){
                let pos = Math.floor(Math.random() * 195);
                pipebox.style.display = "block";
                pipebox.style.top = (pos - 281) + "px";
                pipebox.style.animation = "pipemoving 2s linear forwards";
                setTimeout(function(){
                    let R1 = pos + 40, L2 = R1 + 125;
                    let p = Number(document.getElementById("birdbox").style.top.match(/\d+/)[0]) + 12.5;
                    if(gamerunning && (p <= R1 || L2 <= p)) gameover();
                    if(gamerunning) ++gamescore; else clearInterval(ret);
                }, 1000);
            }
            else clearInterval(ret);
        }, 5);
    }, 2000);
    return ret;
}
function startpipemoving(){
    movingpipe1 = setpipebox("pipebox1");
    setTimeout(function(){
        if(gamerunning) movingpipe2 = setpipebox("pipebox2");
    }, 1000);
}
function stoppipemoving(){
    clearInterval(movingpipe1); movingpipe1 = undefined;
    clearInterval(movingpipe2); movingpipe2 = undefined;
    let pipeboxes = document.getElementsByClassName("pipebox");
    for(let i = 0; i < pipeboxes.length; i++)
        pipeboxes[i].style.animationPlayState = "paused";
}
function startbirdmoving(){
    clicked = false;
    movingbird = setInterval(function(){
        if(gamerunning){
            let birdbox = document.getElementById("birdbox");
            birdbox.style.top = 
                Math.max(0, Math.min(400 - 1, Number(birdbox.style.top.match(/\d+/)[0]) + (clicked ? -30: 30))) + "px";
            birdbox.style.transform = clicked ? "rotate(-30deg)": "rotate(30deg)";
            clicked = false;
        }
    }, 200);
}
function stopbirdmoving(){
    clearInterval(movingbird); movingbird = undefined;
}
function gameover(){
    stopbirdmoving();
    stoppipemoving();
    gamerunning = false;
    document.getElementById("score").innerHTML = gamescore;
    document.getElementById("bestscore").innerHTML = (bestscore = Math.max(gamescore, bestscore));
    document.getElementById("board").style.display = "block";
}
window.onload = function(){
    document.getElementById("flappybird").addEventListener("click", function(){
        if(!gamerunning){
            let nodes = this.childNodes;
            for(let i = 0; i < nodes.length; i++)
                nodes[i].style = "";
            document.getElementById("birdbox").style.top = "200px";
            gamerunning = true; gamescore = 0; clicked = false;
            startpipemoving();
            startbirdmoving();
        }
        else{
            clicked = true;
        }
    });
};