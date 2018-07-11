const builder = require('botbuilder')
const ViberBot = require('viber-bot').Bot
const BotEvents = require('viber-bot').Events
const UserProfile = require('viber-bot').UserProfile
const VTextMessage = require('viber-bot').Message.Text
const VPictureMessage = require('viber-bot').Message.Picture
const VVideoMessage = require('viber-bot').Message.Video
const VRichMediaMessage = require('viber-bot').Message.RichMedia
const VURLMessage = require('viber-bot').Message.Url
const VFileMessage = require('viber-bot').Message.File
const VLocationMessage = require('viber-bot').Message.Location
const VContactMessage = require('viber-bot').Message.Contact
const VStickerMessage = require('viber-bot').Message.Sticker
const winston = require('winston')
const toYAML = require('winston-console-formatter') // makes the output more friendly
const async = require('async')
/*
Until BotBuilder supports custom channels,
we have to use Kik's channelId to make BotBuilder play nice with user data.
We can use any other channel which supports buttons instead of Kik here.
*/
const ViberChannelId = 'kik'

const logger = (function() {
  const logger = new winston.Logger({ level: 'debug' }) // We recommend DEBUG for development
  logger.add(winston.transports.Console, toYAML.config())
  return logger
})()

var ViberEnabledConnector = (function() {
  function ViberEnabledConnector(opts) {
    var self = this
    this.options = opts || {}
    this.viberBot = new ViberBot({
      authToken: this.options.Token,
      name: this.options.Name,
      // It is recommended to be 720x720, and no more than 100kb.
      avatar: this.options.AvatarUrl,
      logger: logger
    })

    this.viberBot.on(BotEvents.MESSAGE_RECEIVED, (message, response) => {
      self.processMessage(message, response)
    })

    /*this.viberBot.on(BotEvents.CONVERSATION_STARTED, (response, onFinish) => {
            // onFinish(new TextMessage(`Hi, ${userProfile.name}! Nice to meet you.`))
            var self = this;
            var userProfile = response.userProfile;
            var addr = {
                channelId: ViberChannelId,
                user: { id: encodeURIComponent(userProfile.id), name: userProfile.name },
                bot: { id: 'viberbot', name: self.options.Name },
                conversation: { id: 'ViberConversationId' }
            };

            var msg = new builder.Message()
                .address(addr)
                .timestamp(convertTimestamp(new Date()))
                .entities();
            msg.type = msg.data.type = 'contactRelationUpdate';
            msg.data.action = 'add';
            this.handler([msg.toMessage()]);
        });*/
  }

  function convertTimestamp(ts) {
    return ts
  }

  ViberEnabledConnector.prototype.processMessage = function(message, response) {
    var self = this
    var userProfile = response.userProfile
    var addr = {
      channelId: ViberChannelId,
      user: { id: encodeURIComponent(userProfile.id), name: userProfile.name },
      bot: { id: 'viberbot', name: self.options.Name },
      conversation: { id: 'ViberConversationId' }
    }
    var msg = new builder.Message()
      .address(addr)
      .timestamp(convertTimestamp(message.timestamp))
      .entities()

    console.log(
      '\n\nMESSAGE ' + message.text + ' REVEICED:\n' + JSON.stringify(message, null, ' ') + '\n\n'
    )
    var rawMessage = message.toJson()
    if (rawMessage.type === 'text') {
      msg = msg.text(message.text)
    } else if (rawMessage.type === 'picture') {
      msg.text(message.text || 'picture').addAttachment({
        contentUrl: rawMessage.media,
        contentType: 'image/jpeg',
        name: 'viberimage.jpeg'
      })
    } else {
      msg = msg.text(message.text || '[json]').addAttachment({
        payload: rawMessage,
        contentType: 'object'
      })
    }
    this.handler([msg.toMessage()])
    return this
  }

  ViberEnabledConnector.prototype.onEvent = function(handler) {
    this.handler = handler
  }

  ViberEnabledConnector.prototype.listen = function() {
    return this.viberBot.middleware()
  }

  ViberEnabledConnector.prototype.send = function(messages, messagesDone) {
    var _this = this
    async.eachSeries(
      messages,
      function(msg, callback) {
        try {
          if (msg.address) {
            _this.postMessage(msg, callback)
          } else {
            logger.error('ViberEnabledConnector: send - message is missing address.')
            callback(new Error('Message missing address.'))
          }
        } catch (e) {
          callback(e)
        }
      },
      messagesDone
    )
  }

  ViberEnabledConnector.prototype.convertToViberMessages = function(message) {
    var viberKb = null
    if (message.sourceEvent && message.sourceEvent.type) {
      switch (message.sourceEvent.type) {
        case 'sticker':
          return [new VStickerMessage(message.sourceEvent.sticker_id, null, null, new Date(), '')]
          break
      }
    }

    console.log(
      '\n\n' + message.type + ' TYPE OBJECT:\n' + JSON.stringify(message, null, ' ') + '\n\n'
    )

    if (message.attachments && message.attachments.length) {
      var attachment = message.attachments[0]
      switch (attachment.contentType) {
        case 'application/vnd.microsoft.keyboard':
          if (attachment.content.buttons && attachment.content.buttons.length) {
            viberKb = {
              Type: 'keyboard',
              DefaultHeight: true,
              Buttons: []
            }
            for (var j = 0; j < attachment.content.buttons.length; j++) {
              var sourceB = attachment.content.buttons[j]
              var btns = {
                ActionType: 'reply',
                ActionBody: sourceB.value,
                Text: sourceB.title,
                TextSize: 'large'
              }
              viberKb.Buttons.push(btns)
            }
          }
          break
        case 'application/vnd.microsoft.card.hero':
          if (message.attachmentLayout && message.attachmentLayout == 'carousel') {
            var allAttachments = []
            message.attachments.forEach(element => {
              var attachment = element.content
              console.log(
                '\n' +
                  attachment.title +
                  ' ATTACHMENT OBJECT:\n' +
                  JSON.stringify(attachment, null, ' ')
              )
              if (attachment.buttons[0].type && attachment.images[0].url) {
                allAttachments.push(
                  {
                    //image
                    Rows: 3,
                    Columns: 6,
                    ActionType: 'none',
                    Image: attachment.images[0].url
                    //first image from the image array only
                  },
                  {
                    //text
                    Rows: 2,
                    Columns: 6,
                    ActionType: 'none',
                    Text:
                      (attachment.title
                        ? '<font size="4" color="#323232"><b>' + attachment.title + '</b></font>'
                        : '') +
                      (attachment.subtitle
                        ? '<font size="2" color="#4C4C4C"><br>' + attachment.subtitle + '</font>'
                        : '') +
                      (attachment.text
                        ? '<font size="1" color="#969696"><br>' + attachment.text
                        : '') +
                      '</font>',
                    TextVAlign: 'middle',
                    TextHAlign: 'left'
                  },
                  {
                    //button
                    Rows: 1,
                    Columns: 6,
                    ActionType:
                      attachment.buttons[0].type === 'reply' ||
                      attachment.buttons[0].type === 'imBack'
                        ? 'reply'
                        : 'open-url',
                    ActionBody: attachment.buttons[0].value,
                    Text:
                      '<b><font size="4" color="#FFFFFF">' + attachment.buttons[0].title ||
                      '' + '</font></b>',
                    BgColor: '#7536D1',
                    TextSize: 'large',
                    TextVAlign: 'middle',
                    TextHAlign: 'middle'
                  }
                )
              } else {
                console.log(
                  '\n\nERROR is viber-connector.js - application/vnd.microsoft.card.hero type attachment "' +
                    attachment.title +
                    '" does not have required parameters (buttons.type or images.url)\n\n'
                )
              }
            })
            var RICH_MEDIA = {
              Type: 'rich_media',
              ButtonsGroupColumns: 6,
              ButtonsGroupRows: 6,
              BgColor: '#C5C5C5',
              Buttons: allAttachments
            }
            if (message.text && message.text != '') {
              return [new VTextMessage(message.text), new VRichMediaMessage(RICH_MEDIA)]
            } else {
              return [new VRichMediaMessage(RICH_MEDIA)]
            }
          }
          break
        case 'video/mp4':
          return [
            new VVideoMessage(
              attachment.contentUrl,
              10000,
              message.text || '',
              null,
              null,
              null,
              null,
              new Date(),
              ''
            )
          ]
        case 'url':
        case 'image/gif':
          if (message.text && message.text != '') {
            return [
              new VTextMessage(message.text || '', viberKb, null, new Date(), ''),
              new VURLMessage(attachment.contentUrl, null, null, new Date(), '')
            ]
          } else {
            return [new VURLMessage(attachment.contentUrl, null, null, new Date(), '')]
          }

        case 'image/png':
        case 'image/jpeg':
          return [
            new VPictureMessage(
              attachment.contentUrl,
              message.text || '',
              null,
              null,
              null,
              new Date(),
              ''
            )
          ]
      }
    }
    return [new VTextMessage(message.text || '', viberKb, null, new Date(), '')]
  }

  ViberEnabledConnector.prototype.postMessage = function(message, cb) {
    var self = this,
      addr = message.address,
      user = addr.user
    var realUserId = decodeURIComponent(addr.user.id)
    var profile = new UserProfile(realUserId, addr.user.name, '', '', '')
    if (message.type === 'typing') {
      // since Viber doesn't support "typing" notifications via API
      // this.viberBot.sendMessage(profile, [new VTextMessage('...', null, null, new Date(), '')]).then(function(x) { cb()}, function(y) {cb()})
      cb()
    } else {
      var viberMessages = self.convertToViberMessages(message)
      viberMessages
        .reduce(
          (promise, vMessage) => promise.then(() => this.viberBot.sendMessage(profile, vMessage)),
          Promise.resolve()
        )
        .then(() => cb())
        .catch(err => console.error(err) || cb())
    }
  }

  ViberEnabledConnector.prototype.startConversation = function(address, done) {
    var addr = address
    address.conversation = { id: 'ViberConversationId' }
    done(null, addr)
  }

  return ViberEnabledConnector
})()

exports.ViberEnabledConnector = ViberEnabledConnector
exports.ViberChannelId = ViberChannelId
