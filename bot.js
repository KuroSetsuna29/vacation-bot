const Client = require('hangupsjs');
const Q = require('q');
const Store = require('data-store');
const winston = require('winston');
require('winston-daily-rotate-file');
const { format } = require('logform');

// Setup logging
const logger = winston.createLogger({
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD H:mm:ss' }),
    format.printf(info => `${info.timestamp} ${info.level.toUpperCase()} ${info.message}`)
  ),
  transports: [
    new winston.transports.Console()
  ]
});

const redirect_logger = winston.createLogger({
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD H:mm:ss' }),
    format.printf(info => info.message[0].trim())
  ),
  transports: [
    new (winston.transports.DailyRotateFile)({
      dirname: '/logs/vacation-bot/',
      filename: '%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxFiles: '14d'
    })
  ]
});

const stdo = process.stdout.write;

function stdo_write() {
  stdo.apply(process.stdout, arguments);
  redirect_logger.info(arguments);
}

process.stdout.write = stdo_write;

process.on('uncaughtException', function(err) {
  logger.error((err && err.stack) ? err.stack : err);
  throw err;
});

// Setup memory store
const store = new Store({ path: './history.json' });

// callback to get promise for creds using stdin. this in turn
// means the user must fire up their browser and get the
// requested token.
const creds = function() {
  return {
    auth: Client.authStdin
  };
};

const client = new Client();

const SELF = (() => {
  var CHAT_ID;
  const getChatId = () => {
    return CHAT_ID;
  };
  const setChatId = (chat_id) => {
    CHAT_ID = chat_id;
  };

  return {
    getChatId,
    setChatId
  };
})();

const message_builder = new Client.MessageBuilder();
const reply_message = message_builder.text("I am currently on vacation.").toSegments();

// set more verbose logging ('debug')
client.loglevel('info');

// receive chat message events
client.on('chat_message', function(event) {

  // Ignore messages from bot
  if (event.sender_id.chat_id == SELF.getChatId()) return;

  Promise.all([
    /* Conversation info */
    client.getconversation(event.conversation_id.id, Date.now(), 1, true)
    .then(conversation => {
      return {
        'id': conversation.conversation_state.conversation_id.id,
        'is_group_chat': conversation.conversation_state.conversation.type == "GROUP"
      };
    }),
    /* Sender info */
    client.getentitybyid([event.sender_id.chat_id]).then(entity => {  
      return {
        'name': entity.entities[0].properties.display_name
      };
    }),
    /* Message string */
    messageSegmentsToString(event.chat_message.message_content.segment),
  ]).then(info => {
    var conversation = info[0];
    var sender = info[1];
    var message = info[2];
    
    logger.info(`chat_message ${conversation.id} ${sender.name}: ${message}`);

    // Only reply once per day
    if (store.has(conversation.id) && new Date(store.get(conversation.id)).toDateString() == new Date().toDateString()) return;

    store.set(conversation.id, new Date().toJSON());
    return sendMessage(conversation.id, reply_message);
  });

});

client.on('connected', event => {
  client.getselfinfo()
  .then(self => {
    SELF.setChatId(self.self_entity.id.chat_id);

    const display_name = self.self_entity.properties.display_name;
    const email = self.self_entity.properties.email;

    logger.info(`connected Logged in as ${display_name} <${email}>`);
  });
});

var reconnect = function() {
  client.connect(creds).then(function() {
      // we are now connected. a `connected`
      // event was emitted.
  });
};

// whenever it fails, we try again
client.on('connect_failed', function() {
  Q.Promise(function(rs) {
      // backoff for 3 seconds
      logger.info(`connect_failed Connection failed, retrying in 3 seconds...`);
      setTimeout(rs,3000);
  }).then(reconnect);
});

// start connection
reconnect();

function messageSegmentsToString(segments) {
  return segments.filter(segment => {
    return segment.type ? segment.type == "TEXT" : segment[0] == 0;
  }).map(segment => {
    return segment.text ? segment.text : segment[1];
  }).join("\n");
}

function sendMessage(conversation_id, message_segments) {
    logger.info(`sendMessage ${conversation_id} Sending message: ${messageSegmentsToString(message_segments)}`);

    return client.sendchatmessage(conversation_id, message_segments);
}
