const WebSocket = require('ws');

let ws = null
let subList = []

let intervalId = null

function subscribe(nodeUrl, t, callback) {
    try {
        if (ws != null) {
            //如果已经订阅过直接返回
            if (subList.includes(t)) {
                return
            }
            //直接开始订阅
            sub(t)
        } else {
            ws = new WebSocket(nodeUrl)
            ws.on('open', function () {
                console.log('WebSocket open');
                //初始化后再订阅
                sub(t)
                //开启3秒心跳
                intervalId = setInterval(ping, 10000);
            });

            ws.on('message', function (message) {
                let msg = JSON.parse(message.toString("utf8"))
                if(msg.event!=1){
                    callback(msg.data, null)
                }

            });

            ws.on('close', function () {
                console.log('WebSocket close');
                ws = null
                clearInterval(intervalId)
            });

            ws.on('error', function (error) {
                console.error('WebSocket error: ', error);
                clearInterval(intervalId)
                ws = null
                callback(null, error)
            });
        }
    } catch (e) {
        callback(null, e)
    }
}

function unsubscribe(t, callback) {
    let error, result
    try {
        result = unSub(t)
    } catch (e) {
        error = e
    }
    callback(result, error)
}


function clearSubscriptions() {
    if (ws!=null) {
        subList = []
        ws.close()
        ws = null
    }
}


function sub(t) {
    if (ws!=null) {
        if (t != "block") {
            throw new Error("不支持的订阅类型")
        }
        let message = {
            event: 10001,
            data: t
        }
        send(message);
        //添加所有订阅名称
        subList.push(t)
    }
}

function unSub(t) {
    if (ws!=null) {
        if (t != "block") {
            throw new Error("不支持的订阅类型")
        }
        let message = {
            event: 10002,
            data: t
        }
        return send(message);
    }
}


function ping() {
    let message = {
        event: 0,
        data: Math.random()

    }
    send(message)
}


function send(message) {
    if (ws) {
        let msg = JSON.stringify(message)
        return ws.send(msg)
    }
}


module.exports = {
    BRC20pm: {
        subscribe,
        unsubscribe,
        clearSubscriptions,
    }
}