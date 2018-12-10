var builder = require('botbuilder')
const ViberBot = require('viber-bot').Bot
const BotEvents = require('viber-bot').Events
const UserProfile = require('viber-bot').UserProfile
const VMessage = require('viber-bot').Message
const winston = require('winston')
const toYAML = require('winston-console-formatter') // makes the output more friendly
const async = require('async')
var util = require('util')

/*
Until BotBuilder supports custom channels,
we have to use Kik's channelId to make BotBuilder play nice with user data.
We can use any other channel which supports buttons instead of Kik here.
*/
const ViberChannelId = 'kik'

const logger = (function() {
  const logger = winston.createLogger()
  logger.add(
    new winston.transports.Console({
      format: winston.format.simple()
    })
  )
  return logger
})()

//function to quickly translate objects into readable strings
const prettify = obj => {
  if (typeof obj === 'string') return obj
  else return JSON.stringify(obj, null, ' ')
}

var ViberEnabledConnector = (function() {
  function ViberEnabledConnector(opts) {
    var self = this
    this.options = opts || {}
    this.viberBot = new ViberBot({
      authToken: this.options.Token,
      name: this.options.Name,
      // 720x720, <100kB
      avatar: this.options.AvatarUrl,
      logger: logger
    })

    this.viberBot.on(BotEvents.MESSAGE_RECEIVED, (message, response) => {
      self.processMessage(message, response)
    })
  }

  function convertTimestamp(ts) {
    return ts
  }
  ViberEnabledConnector.prototype.makeTextMessage = function(message) {
    var viberKb = null
    if (message && message.message) {
      if (message.button) {
        viberKb = {
          Type: 'keyboard',
          //DefaultHeight: true,
          Buttons: [
            {
              ActionType: 'reply',
              ActionBody: message.button,
              Text: message.button,
              TextSize: 'large'
            }
          ]
        }
      }
      return new VMessage.Text(message.message, viberKb)
    }
  }

  ViberEnabledConnector.prototype.processMessage = function(message, response) {
    var self = this
    var userProfile = response.userProfile
    var addr = {
      channelId: ViberChannelId,
      user: { id: encodeURIComponent(userProfile.id), name: userProfile.name },
      bot: { id: 'viberbot', name: self.options.Name },
      conversation: { id: encodeURIComponent(userProfile.id) }
    }

    var msg = new builder.Message()
      .address(addr)
      .timestamp(convertTimestamp(message.timestamp))
      .entities()

    logger.info('MESSAGE %s RECEIVED!\n%s\n\n', message.text, prettify(message))

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
    logger.info('OBJECT OF TYPE %s:\n%s\n', message.type, util.inspect(message))

    if (message.type != 'endOfConversation') {
      if (message.sourceEvent && message.sourceEvent.type) {
        switch (message.sourceEvent.type) {
          case 'sticker':
            return [
              new VMessage.Sticker(message.sourceEvent.sticker_id, null, null, new Date(), '')
            ]
        }
      }

      if (message.attachments && message.attachments.length) {
        var attachment = message.attachments[0]
        switch (attachment.contentType) {
          case 'application/vnd.microsoft.keyboard':
            if (attachment.content.buttons && attachment.content.buttons.length) {
              viberKb = {
                Type: 'keyboard',
                //DefaultHeight: true,
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
              var rows = 0
              message.attachments.forEach(element => {
                var attachment = element.content

                logger.info('CARD OBJECT %s:\n%s\n', message.type, util.inspect(attachment))

                let images = []
                let text = []
                let buttons = []

                if (attachment.images && attachment.images.length > 0) {
                  attachment.images.map(image => {
                    images.push({
                      Rows: 3,
                      Columns: 6 / attachment.images.length,
                      ActionType: 'none',
                      Image: image.url
                    })
                  })
                }

                if (attachment.title || attachment.subtitle || attachment.text) {
                  text.push({
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
                  })
                }

                if (
                  attachment.buttons &&
                  attachment.buttons.length > 0 &&
                  attachment.buttons[0].value
                ) {
                  attachment.buttons.map(button => {
                    buttons.push({
                      //button
                      Rows: 1,
                      Columns: 6 / attachment.buttons.length,
                      ActionType:
                        button.type === 'reply' || button.type === 'imBack' ? 'reply' : 'open-url',
                      ActionBody: button.value,
                      Text:
                        '<b><font size="4" color="#FFFFFF">' + button.title || '' + '</font></b>',
                      BgColor: '#7536D1',
                      TextSize: attachment.buttons.length === 1 ? 'large' : 'small',
                      TextVAlign: 'middle',
                      TextHAlign: 'middle'
                    })
                  })
                }

                var rowCount = 0
                if (images.length > 0) {
                  rowCount += 3
                  allAttachments = [...allAttachments, ...images]
                }
                if (text.length > 0) {
                  rowCount += 2
                  allAttachments = [...allAttachments, ...text]
                }
                if (buttons.length > 0) {
                  rowCount += 1
                  allAttachments = [...allAttachments, ...buttons]
                }

                if (rows < rowCount) rows = rowCount
              })

              var RICH_MEDIA = {
                Type: 'rich_media',
                ButtonsGroupColumns: 6,
                ButtonsGroupRows: Math.min(rows, 6),
                BgColor: '#C5C5C5',
                Buttons: allAttachments
              }
              if (message.text && message.text != '') {
                return [new VMessage.Text(message.text), new VMessage.RichMedia(RICH_MEDIA)]
              } else {
                return [new VMessage.RichMedia(RICH_MEDIA)]
              }
            }
            break
          case 'video/mp4':
            return [
              new VMessage.Video(
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
                new VMessage.Text(message.text || '', viberKb, null, new Date(), ''),
                new VMessage.Url(attachment.contentUrl, null, null, new Date(), '')
              ]
            } else {
              return [new VMessage.Url(attachment.contentUrl, null, null, new Date(), '')]
            }
          case 'image/png':
          case 'image/jpeg':
            return [
              new VMessage.Picture(
                attachment.contentUrl,
                message.text || '',
                null,
                null,
                null,
                new Date(),
                ''
              )
            ]
          default:
            //if the format is undefined above, then it will be sent as a File Message
            return new VMessage.File(
              attachment.contentUrl,
              10000,
              attachment.name,
              null,
              null,
              new Date(),
              ''
            )
        }
      }
      return [new VMessage.Text(message.text || '', viberKb, null, new Date(), '')]
    }
  }

  ViberEnabledConnector.prototype.postMessage = function(message, cb) {
    var self = this,
      addr = message.address
    var realUserId = decodeURIComponent(addr.user.id)
    var profile = new UserProfile(realUserId, addr.user.name, '', '', '')
    if (message.type === 'typing') {
      // since Viber doesn't support "typing" notifications via API
      // this.viberBot.sendMessage(profile, [new VTextMessage('...', null, null, new Date(), '')]).then(function(x) { cb()}, function(y) {cb()})
      cb()
    } else {
      var viberMessages = self.convertToViberMessages(message)
      // a smart solution how to process an array of messages sent back from `sendMessage` function,
      // and execute them sequentially one after the other
      if (viberMessages && viberMessages.length > 0)
        viberMessages
          .reduce(
            (promise, vMessage) => promise.then(() => this.viberBot.sendMessage(profile, vMessage)),
            Promise.resolve()
          )
          .then(() => cb())
          .catch(err => console.error(err) || cb())
      else cb()
    }
  }

  ViberEnabledConnector.prototype.startConversation = function(address, done) {
    address.conversation = { id: 'ViberConversationId' }
    done(null, address)
  }

  return ViberEnabledConnector
})()

exports.ViberEnabledConnector = ViberEnabledConnector
exports.ViberChannelId = ViberChannelId
