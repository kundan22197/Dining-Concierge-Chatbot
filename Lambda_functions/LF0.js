const AWS = require('aws-sdk');

exports.handler = (event, context, callback) => {
    const lex = new AWS.LexRuntime();
    lex.postText({
        botName: 'RestaurantSuggestion',
        botAlias: '$LATEST',
        userId: 'satest',
        inputText: event['query']
    }, callback);
};