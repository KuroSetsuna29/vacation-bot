const Client = require('hangupsjs');
const log = require('bog');

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

const reply_message = "I am currently on vacation.";

// set more verbose logging
client.loglevel('info');

// receive chat message events
client.on('chat_message', function(event) {

  // Ignore messages from bot
  if (event.sender_id.chat_id == SELF.getChatId()) return;

  const conversation_id = event.conversation_id.id;
  const message = event.chat_message.message_content.segment.filter(segment => {
    return segment.type == "TEXT";
  }).map(segment => {
    return segment.text;
  }).join("\n");

  client.getentitybyid([event.sender_id.chat_id]).then(entity => {
    const sender = entity.entities[0].properties.display_name;

    log.info('chat_message', conversation_id, `${sender}: ${message}`);

    return sendMessage(conversation_id, reply_message);
  })

});

client.on('connected', event => {
  client.getselfinfo()
  .then(self => {
    SELF.setChatId(self.self_entity.id.chat_id);

    const display_name = self.self_entity.properties.display_name; client.di
    const email = self.self_entity.properties.email;

    log.info('connected', `Logged in as ${display_name} <${email}>`);
  });
});

client.connect(creds).done();

function sendMessage(conversation_id, message) {
    log.info('sendMessage', conversation_id, `Sending message: ${message}`);

    const message_builder = new Client.MessageBuilder();
    const message_segments = message_builder.text(message).toSegments();

    return client.sendchatmessage(conversation_id, message_segments);
}
