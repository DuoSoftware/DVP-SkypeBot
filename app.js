var restify = require('restify');
var builder = require('botbuilder');
var jsonwebtoken = require('jsonwebtoken');
var config = require('config');
var validator = require('validator');
var util = require("util");
var moment  = require('moment');
var uuid = require('node-uuid');


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
};


function createCSATCard(session, name, avatar) {
    return new builder.ThumbnailCard(session)
        .title('customer satisfaction survey')
        .subtitle(name)
        .text("Are you satisfied with our service ?")
        .images([builder.CardImage.create(session, avatar)])
        .buttons([
            builder.CardAction.postBack(session, 'yes', 'Satisfied'),
            builder.CardAction.postBack(session, 'no', 'Not Satisfied')
        ]);
}







//=========================================================
// Bots Dialogs
//=========================================================

bot.dialog('/', function (session) {


    if(!sockets[session.message.address.user.id]) {
        var socket = require('socket.io-client')(messengerURL, {forceNew: true});
        sockets[session.message.address.user.id] = socket;
        socket.on('connect', function () {

            var session_id = uuid.v1();
            var jwt = jsonwebtoken.sign({
                session_id: session_id,
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

                    socket.emit("message", {
                        message: session.message.text,
                        type:"text" ,
                    });


                    function retryAgent () {

                        socket.emit("retryagent");
                    }

                    var retryObj = setInterval(retryAgent, 30000);


                    retryAgent();

                    socket.on('agent', function(data){

                        if(retryObj) {
                            clearInterval(retryObj);
                        }
                        console.log(data);
                        var card = createAnimationCard(session,data.name, data.avatar);

                        session.userData.agent = data;

                        var msg = new builder.Message(session).addAttachment(card);
                        session.send(msg);
                    });



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

                        if(retryObj){

                            clearInterval(retryObj);
                        }

                        if(data && data.name && data.avatar) {
                            console.log(data);
                            var card = createAnimationCard(session, data.name, data.avatar);
                            var msg = new builder.Message(session).addAttachment(card);
                            session.send(msg);
                        }

                    });


                    socket.on('left', function(data){

                        session.send("Agent left the chat");


                        if(sockets[session.message.address.user.id]) {
                            session.beginDialog('/csat');
                            delete sockets[session.message.address.user.id];
                        }
                        if(retryObj){

                            clearInterval(retryObj);
                        }
                        socket.disconnect();

                    });

                    socket.on('disconnect', function () {

                        //session.send("Agent left the chat due to technical issue...");

                        if(sockets[session.message.address.user.id]) {
                            //session.endConversation();
                            delete sockets[session.message.address.user.id];
                        }
                        if(retryObj){

                            clearInterval(retryObj);
                        }

                    });

                })
                .on('unauthorized', function (msg) {
                    console.log("unauthorized: " + JSON.stringify(msg.data));
                    delete sockets[session.message.address.user.id];
                    //throw new Error(msg.data.type);
                })

        });

    }else{

        //session.send("Please waiting for human agent to take over  !!!!!");

        sockets[session.message.address.user.id].emit("message", {
            message: session.message.text,
            type:"text" ,
        });

        //console.log("Another user interacted "+session.message.text);

    }

});

bot.dialog('/dispatch', function (session) {

    console.log(session.message);
    session.endDialog();
});

bot.dialog('/csat', function (session) {/*[

    function (session) {
        console.log("test");
        var card = createCSATCard(session, session.userData.agent.name, session.userData.agent.avatar);
        var msg = new builder.Message(session).addAttachment(card);
        session.send(msg);
    },

    function (session,result ) {
        console.log(session.message);
        session.send("Thank you for your time ---> " + session.message.text);
        session.endConversation();
    }]*/

    console.log(session.message);
    session.send("Thank you for your time ---> " + session.message.text);
    session.endConversation();

});

