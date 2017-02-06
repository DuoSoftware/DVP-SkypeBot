var restify = require('restify');
var builder = require('botbuilder');
var jsonwebtoken = require('jsonwebtoken');
var config = require('config');
var validator = require('validator');
var util = require("util");
var moment  = require('moment');


var sockets = {};


var messengerURL = util.format("http://%s", config.Services.messengerhost);
if (validator.isIP(config.Services.messengerhost))
    messengerURL = util.format("http://%s:%d", config.Services.messengerhost, config.Services.messengerport);


/*

 var socket = require('socket.io-client')('http://localhost');
 socket.on('connect', function(){});
 socket.on('event', function(data){});
 socket.on('disconnect', function(){});



 // sign with default (HMAC SHA256)
 var jwt = require('jsonwebtoken');
 var token = jwt.sign({ foo: 'bar' }, 'shhhhh');
 //backdate a jwt 30 seconds
 var older_token = jwt.sign({ foo: 'bar', iat: Math.floor(Date.now() / 1000) - 30 }, 'shhhhh');

 // sign with RSA SHA256
 var cert = fs.readFileSync('private.key');  // get private key
 var token = jwt.sign({ foo: 'bar' }, cert, { algorithm: 'RS256'});

 // sign asynchronously
 jwt.sign({ foo: 'bar' }, cert, { algorithm: 'RS256' }, function(err, token) {
 console.log(token);
 });

 */

//=========================================================
// Bot Setup
//=========================================================

// Setup Restify Server



var restify = require('restify');
var fs = require('fs');


var https_options = {
    ca: fs.readFileSync('/etc/ssl/fb/COMODORSADomainValidationSecureServerCA.crt'),
    key: fs.readFileSync('/etc/ssl/fb/SSL1.txt'),
    certificate: fs.readFileSync('/etc/ssl/fb/STAR_duoworld_com.crt')
};


var server = restify.createServer(https_options);
server.listen(process.env.port || process.env.PORT || 3978, function () {
    console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
var connector = new builder.ChatConnector({
    appId: '4d973783-5aea-427b-bdf7-28e48fab1e16',
    appPassword: 'pb8KyMaO7YV0j8omHZ9yfdy'
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

////////////////////agent card///////////////////////////////////////////////////////////////////////////


function createAnimationCard(session, name, avatar) {
    return new builder.ThumbnailCard(session)
        .title('Agent found')
        .subtitle(name)
        .text("Agents greeting can be added !!!!!!!!!!")
        .images([builder.CardImage.create(session, avatar)]);
}


//=========================================================
// Bots Dialogs
//=========================================================

bot.dialog('/', function (session) {


    if(!sockets[session.message.address.user.id]) {
        var socket = require('socket.io-client')(messengerURL, {forceNew: true});
        socket.on('connect', function () {

            var jwt = jsonwebtoken.sign({
                iss: config.Host.iss,
                iat: moment().add(1, 'days').unix(),
                company: config.Host.company,
                tenant: config.Host.tenant,
                contact: session.message.address,
                channel: 'skype',
                jti: session.message.address.user.id,
                attributes: ["60"],
                priority: "0",
                name: session.message.address.user.name

            }, config.Host.secret);

            socket
                .emit('authenticate', {token: jwt}) //send the jwt
                .on('authenticated', function () {
                    //do other things


                    session.send("Please waiting for human agent to take over");
                    sockets[session.message.address.user.id] = socket;


                    function retryAgent () {

                        socket.emit("retryagent");
                    }

                    var retryObj = setInterval(retryAgent, 30000);


                    socket.on('agent', function(data){

                        clearInterval(retryObj);
                        console.log(data);
                        var card = createAnimationCard(session,data.name, data.avatar);
                        var msg = new builder.Message(session).addAttachment(card);
                        session.send(msg);
                    })



                    socket.on('typing', function (data) {

                        session.sendTyping();
                    });

                    socket.on('typingstoped', function (data) {

                    });

                    socket.on('seen', function (data) {

                    });

                    socket.on("message", function(data){

                        session.send(data.message);
                    });

                    socket.on('existingagent', function(data){

                        if(data && data.name && data.avatar) {
                            console.log(data);
                            var card = createAnimationCard(session, data.name, data.avatar);
                            var msg = new builder.Message(session).addAttachment(card);
                            session.send(msg);
                        }

                    });


                    socket.on('left', function(data){

                        session.send("Agent left the chat");
                        delete sockets[session.message.address.user.id];
                        session.endConversation();
                        socket.disconnect();

                    })

                })
                .on('unauthorized', function (msg) {
                    console.log("unauthorized: " + JSON.stringify(msg.data));
                    throw new Error(msg.data.type);
                })

        });
        socket.on('disconnect', function () {

        });
    }else{

        //session.send("Please waiting for human agent to take over  !!!!!");

        sockets[session.message.address.user.id].emit("message", {
            message: session.message.text,
            type:"text" ,
        });
    }

});

bot.dialog('/dispatch', function (session) {

    console.log(session.message);
    session.endDialog();
});
