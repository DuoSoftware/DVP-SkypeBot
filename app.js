var restify = require('restify');
var builder = require('botbuilder');
var jsonwebtoken = require('jsonwebtoken');
var config = require('config');
var validator = require('validator');
var util = require("util");
var moment  = require('moment');
var uuid = require('node-uuid');
var request = require('request');


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
    appId: config.Bot.appId,
    appPassword: config.Bot.appPassword
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
            builder.CardAction.postBack(session, 'good', 'Satisfied'),
            builder.CardAction.postBack(session, 'bad', 'Not Satisfied')
        ]);
}

function createTicketCard(session, subject, reference,type,priority, tags){

    return new builder.ThumbnailCard(session)
        .title("New ticket has been created")
        .subtitle(subject)
        .subtitle(type)
        .subtitle(priority)
        .text("Your reference id is "+reference);

}


function CreateSubmission(session, requester, submitter, satisfaction,contact, cb){

    var token = util.format("Bearer %s",config.Host.token);
    if((config.Services && config.Services.csaturl && config.Services.csatport && config.Services.csatversion)) {


        //console.log("CreateSubmission start");
        var csatURL = util.format("http://%s/DVP/API/%s/CustomerSatisfaction/Submission/ByEngagement", config.Services.csaturl, config.Services.csatversion);
        if (validator.isIP(config.Services.csaturl))
            csatURL = util.format("http://%s:%d/DVP/API/%s/CustomerSatisfaction/Submission/ByEngagement", config.Services.csaturl, config.Services.csatport, config.Services.csatversion);

        var csatData =  {

            requester: requester,
            submitter: submitter,
            engagement: session,
            method:'chat',
            satisfaction: satisfaction,
            contact: contact


        };



       // logger.debug("Calling CSAT service URL %s", ticketURL);
       // logger.debug(csatData);

        request({
            method: "POST",
            url: csatURL,
            headers: {
                authorization: token,
                companyinfo: util.format("%d:%d", config.Host.tenant, config.Host.company)
            },
            json: csatData
        }, function (_error, _response, datax) {


            try {

                console.log(_response.body);

                if (!_error && _response && _response.statusCode == 200 && _response.body && _response.body.IsSuccess) {

                    cb(true, _response.body.Result);

                }else{

                   // logger.error("There is an error in  create csat for this session "+ session);

                    cb(false, undefined);


                }
            }
            catch (excep) {

                //logger.error("There is an error in  create csat for this session "+ session, excep);
                cb(false, undefined);

            }
        });
    }
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
            session.userData.session_id = session_id;

            var channel = "skype";
            if(session.message.address.channelId){
                channel = session.message.address.channelId;
             }

            var jwt = jsonwebtoken.sign({
                session_id: session_id,
                iss: config.Host.iss,
                iat: moment().add(1, 'days').unix(),
                company: config.Host.company,
                tenant: config.Host.tenant,
                contact: session.message.address,
                channel: channel,
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


                    //retryAgent();

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

                        if(data.type == 'link' && data.mediaType && data.mediaName){

                            try {
                                var attachment = {
                                    contentUrl: "http://www.axialis.com/tutorials/sample/logo-ps.png",
                                    //data.message,
                                    contentType: data.mediaType,
                                    name: data.mediaName
                                };

                                console.log(attachment);
                                var msg = new builder.Message(session)
                                    .addAttachment(attachment);

                                console.log(data)
                                session.send(msg);
                            }catch(ex){
                                console.log(ex);
                            }


                        }else {
                            session.send(data.message);
                        }

                    });

                    socket.on("ticket", function(data){

                        console.log(data);
                        var card = createTicketCard(session,data.subject,data.reference,data.type, data.prority ,data.tags);
                        var msg = new builder.Message(session).addAttachment(card);
                        session.send(msg);
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



        if (session.message.attachments && session.message.attachments.length > 0) {


            //var attachment = msg.attachments[0];
            //var fileDownload = checkRequiresToken(msg)
            //    ? requestWithToken(attachment.contentUrl)
            //    : request(attachment.contentUrl);
            //
            //fileDownload.then(
            //    function (response) {
            //
            //        // Send reply with attachment type & size
            //        var reply = new builder.Message(session)
            //            .text('Attachment of %s type and size of %s bytes received.', attachment.contentType, response.length);
            //        session.send(reply);
            //
            //
            //
            //    }).catch(function (err) {
            //    console.log('Error downloading attachment:', { statusCode: err.statusCode, message: err.response.statusMessage });
            //});

            sockets[session.message.address.user.id].emit("message", {
                message: session.message.text,
                mediaType:session.message.attachments[0].contentType,
                //mediaToken:obtainToken(),
                link:session.message.attachments[0].contentUr,
                type:"link" ,
            });


        }else{

            sockets[session.message.address.user.id].emit("message", {
                message: session.message.text,
                type:"text" ,
            });
        }


        //console.log("Another user interacted "+session.message.text);

    }

});

bot.dialog('/dispatch', function (session) {

    console.log(session.message);
    session.endDialog();
});

bot.dialog('/csat', [

    function (session, args, next) {

        if(!session.userData.csat) {
            console.log("test");
            var card = createCSATCard(session, session.userData.agent.name, session.userData.agent.avatar);
            var msg = new builder.Message(session).addAttachment(card);
            session.userData.csat = true;
            session.send(msg);
        }else{

            next();
        }
    },

    function (session,result ) {
        session.userData.csat = undefined;
        console.log(result);
        session.send("Thank you for your time ---> " + session.message.text);
        CreateSubmission(session.userData.session_id,session.userData.agent.id,session.userData.agent.client,session.message.text,session.message.address.user.name,function(){

        })
        session.endConversation();
    }]

    //console.log(session.message);
    //session.send("Thank you for your time ---> " + session.message.text);
    //session.endConversation();
);


var checkRequiresToken = function (message) {
    return message.source === 'skype' || message.source === 'msteams';
};

//var requestWithToken = function (url) {
//    return obtainToken().then(function (token) {
//        return request({
//            url: url,
//            headers: {
//                'Authorization': 'Bearer ' + token,
//                'Content-Type': 'application/octet-stream'
//            }
//        });
//    });
//};

// Promise for obtaining JWT Token (requested once)
//var obtainToken = Promise.promisify(connector.getAccessToken.bind(connector));


