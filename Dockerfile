#FROM ubuntu
#RUN apt-get update
#RUN apt-get install -y git nodejs npm nodejs-legacy
#RUN git clone git://github.com/DuoSoftware/DVP-SkypeBot.git /usr/local/src/skypebot
#RUN cd /usr/local/src/skypebot; npm install
#CMD ["nodejs", "/usr/local/src/skypebot/app.js"]
#
#EXPOSE 8892

FROM node:9.9.0
ARG VERSION_TAG
RUN git clone -b $VERSION_TAG https://github.com/DuoSoftware/DVP-SkypeBot.git /usr/local/src/skypebot
RUN cd /usr/local/src/skypebot;
RUN apt-get update -y
RUN apt-get install imagemagick -y
WORKDIR /usr/local/src/skypebot
RUN npm install
EXPOSE 8892
CMD [ "node", "/usr/local/src/skypebot/app.js" ]
