exports.handler = async (event) => {
    //var phoneUtil = require('google-libphonenumber').PhoneNumberUtil.getInstance();
    //var phoneNumberFormat = require('google-libphonenumber').PhoneNumberFormat;
    var message = "";
    var restaurantSuggestion = "";
    var sqsQueueUrl = "<queueurl>";
    var AWS = require('aws-sdk');
    AWS.config.update({region: 'us-east-1'});
    var sqs = new AWS.SQS();
    var ddb = new AWS.DynamoDB();
    var ses = new AWS.SES();
    var rest_list = [];
    var receiveMessageParams = {
        QueueUrl: sqsQueueUrl,
        MaxNumberOfMessages: 1
    };
    return sqs.receiveMessage(receiveMessageParams).promise()
    .then((data) => {
        if(!data.hasOwnProperty('Messages')){
            //message = JSON.parse('{"cuisine":"indian","diningdate":"2019-10-07","diningtime":"18:00","location":"Manhattan","numberofpeople":"6","email":"hardik.jivani@nyu.edu"}');
            throw 'No Messages found in SQS';
        } else {
            message = JSON.parse(data.Messages[0].Body);
            var deleteMessageParams = {
                QueueUrl: sqsQueueUrl,
                ReceiptHandle: data.Messages[0].ReceiptHandle
            };
            
            return sqs.deleteMessage(deleteMessageParams).promise();
        }
        
        //actualMessage = JSON.parse(data.Messages[0].Body).currentIntent.slotDetails;
        
    })
    .then((data) =>{
        return new Promise((resolve, reject) => {
            const https = require('https');
            let url = "https://search-yelp-151214856dsas1fsafas1.us-east-1.es.amazonaws.com/restaurants/_search?q=cuisine:'"+message.cuisine+"'";
            https.get(url, (res) => {
                res.setEncoding('utf8');
                let rawData = '';
                res.on('data', (d) => {
                    rawData += d;
                });
                res.on('end', () => {
                    try {
                        const parsedData = JSON.parse(rawData);
                        var results = parsedData.hits.hits;
                        if (results != null && !results.empty) {
                            var item;
                            for (item in results) {
                                var x = JSON.stringify(results[item]._source.restaurantid);
                                rest_list.push(x);
                            }
                        }
                        resolve(rest_list);
                    } catch (e) {
                        reject(e.message);
                    }
                });
            }).on('error', (e) => {
                console.error(e);
            });
        });
    })
    .then((data) =>{
        console.log("data : "+data.toString());
        var first = data[0].replace(/^"(.*)"$/, '$1');
        var second = data[1].replace(/^"(.*)"$/, '$1');
        var third = data[2].replace(/^"(.*)"$/, '$1');

        var params = {
            RequestItems: {
                "yelp-restaurants": {
                    Keys: [
                        {
                            "id":{"S":first}
                        },
                        {
                            "id":{"S":second}
                        },
                        {
                            "id":{"S":third}
                        }
                    ],
                    ProjectionExpression: "#n, address",
                    ExpressionAttributeNames: {'#n': 'name'}
                },
            },
            ReturnConsumedCapacity: "TOTAL"
        };/*
        var params = {
          ExpressionAttributeValues: {
            ':d': first
          },
          ProjectionExpression: '#n, address, cuisine, #u',
          KeyConditionExpression: 'id = :d',
          ExpressionAttributeNames: {'#n': 'name', '#u': 'url'},
          TableName: 'yelp-restaurants',
          Limit: 1
        };*/
        console.log("params : "+JSON.stringify(params));
        return new Promise((resolve, reject) => {
            ddb.batchGetItem(params, function(err, res) {
              if (err) {
                console.log("Error", err);
                reject(err);
              } else {
                console.log("Success", res.Responses);
                
                var tmpArr = message.diningtime.split(':'), time12;
                if(+tmpArr[0] == 12) {
                    time12 = tmpArr[0] + ':' + tmpArr[1] + ' pm';
                } else {
                    if(+tmpArr[0] == 00) {
                        time12 = '12:' + tmpArr[1] + ' am';
                    } else {
                        if(+tmpArr[0] > 12) {
                            time12 = (+tmpArr[0]-12) + ':' + tmpArr[1] + ' pm';
                        } else {
                            time12 = (+tmpArr[0]) + ':' + tmpArr[1] + ' am';
                        }
                    }
                }
                message.diningtime = time12;
                restaurantSuggestion = "Hello! Here are my "+message.cuisine+" restaurant suggestions for "+message.numberofpeople+" people, for "+message.diningdate+" at "+message.diningtime+".\n\n ";
                var x = 0;
                res.Responses['yelp-restaurants'].forEach(function(item) {
                  restaurantSuggestion += ++x+". "+JSON.stringify(item.name.S).replace(/^"(.*)"$/, '$1')+", located at "+JSON.stringify(item.address.S).replace(/^"(.*)"$/, '$1')+",\n ";
                });
                restaurantSuggestion = restaurantSuggestion.substring(0, restaurantSuggestion.lastIndexOf(',')) 
                            + "." 
                            + restaurantSuggestion.substring(restaurantSuggestion.lastIndexOf(',')+1);
                restaurantSuggestion += "\n\nEnjoy your meal!"
                //console.log("rS: "+restaurantSuggestion);
                resolve(restaurantSuggestion);
              }
            });
        });
    })
    .then((data) =>{
        console.log("Message : "+data.toString());
        console.log("Email : "+message.email);
        //var parsedPhoneNumber = phoneUtil.parseAndKeepRawInput(message.Phone_Number,'US');
        //var phoneNumberE164 = phoneUtil.format(parsedPhoneNumber, phoneNumberFormat.E164);
        var emailParams = {
            Destination: {
                ToAddresses: [message.email]
            },
            Message: {
                Body: {
                    Text: { Data: data.toString() }
                },
                
                Subject: { Data: "Dining Suggestions" }
            },
            Source: "hardik.jivani@nyu.edu"
        };
        console.log(emailParams)
        return ses.sendEmail(emailParams).promise();
    })
    .catch((err) => {
        console.log(err);
    })
};