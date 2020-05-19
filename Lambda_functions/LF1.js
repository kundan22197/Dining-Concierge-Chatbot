'use strict';
     
function close(sessionAttributes, fulfillmentState, message) {
    return {
        sessionAttributes,
        dialogAction: {
            type: 'Close',
            fulfillmentState,
            message,
        },
    };
}
 
 function elicitSlot(sessionAttributes, intentName, slots, slotToElicit, message) {
    return {
        sessionAttributes,
        dialogAction: {
            type: 'ElicitSlot',
            intentName,
            slots,
            slotToElicit,
            message,
        },
    };
}

// Used for elicit slots
function delegate(sessionAttributes, slots) {
    return {
        sessionAttributes,
        dialogAction: {
            type: 'Delegate',
            slots,
        },
    };
}
function buildValidationResult(isValid, violatedSlot, messageContent) {
    if (messageContent == null) {
        return {
            isValid,
            violatedSlot,
        };
    }
    return {
        isValid,
        violatedSlot,
        message: { contentType: 'PlainText', content: messageContent },
    };
}

function parseLocalDate(date) {
    /**
     * Construct a date object in the local timezone by parsing the input date string, assuming a YYYY-MM-DD format.
     * Note that the Date(dateString) constructor is explicitly avoided as it may implicitly assume a UTC timezone.
     */
    const dateComponents = date.split(/\-/);
    return new Date(dateComponents[0], dateComponents[1] - 1, dateComponents[2]);
}

function isValidDate(date) {
    try {
        return !(isNaN(parseLocalDate(date).getTime()));
    } catch (err) {
        return false;
    }
}


function validateSlot(cuisine, location, date, time, people, email) {

    // Check whether it is a valid cuisine type, this list is from Google search result
    if (cuisine) {
        const CuisineTypes = ['chinese', 'italian', 'indian', 'korean', 'mexican'];
        if (CuisineTypes && CuisineTypes.indexOf(cuisine.toLowerCase()) === -1) {
            return buildValidationResult(false, 'cuisine', `We currently do not support ${cuisine} as a valid cuisine. Can you try a different one?`);
        }
    }
    
    if(location) {
        const locationtypes = ['manhattan', 'staten island', 'queens', 'brooklyn', 'bronx', 'new york', 'new york city'];
        if (locationtypes && locationtypes.indexOf(location.toLowerCase()) === -1) {
            return buildValidationResult(false, 'location', `We currently do not support ${location} . Can you please enter one of the five boroughs in ?`);
        }
    }
    
    // Check whether given date is valid
    if (date) { // if date is given
        if (!isValidDate(date)) {
            return buildValidationResult(false, 'diningdate', 'I did not understand that, what date would you like to make restaurant reservation?');
        }
        if (parseLocalDate(date) < new Date().setHours(0,0,0,0)) {
            return buildValidationResult(false, 'diningdate', 'The date you chose is not valid. What day would you like to make the reservation?');
        }
    }

    // Check whether the given time is valid
    if (time) {
        if (time.length !== 5) {    // the input is given as HH:MM
            // Not a valid time; use a prompt defined on the build-time model.
            return buildValidationResult(false, 'diningtime', null);
        }
        const hour = parseInt(time.substring(0, 2), 10);
        const minute = parseInt(time.substring(3), 10);
        if (isNaN(hour) || isNaN(minute)) {
            // Not a valid time; use a prompt defined on the build-time model.
            return buildValidationResult(false, 'diningtime', null);
        }
        if (date){  // if date is also given
            if (new Date(`${date} ${time}`) < new Date())
                return buildValidationResult(false, 'diningtime', 'The time is in the past. Please input time again.');
        }
    }

    // Check whether the given number of people is valid
    if (people) {
        const numberOfPeople = parseFloat(people);
        if (isNaN(numberOfPeople) || !Number.isInteger(numberOfPeople) || people <= 0 || people >=50)
            return buildValidationResult(false, 'numberofpeople', 'The number is invalid. How many people are in your party?');
    }

    if (email){
        if (!(/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/.test(email)))
            return buildValidationResult(false, 'email', 'The email address is invalid. Please re-enter email address.');       
    }

    return buildValidationResult(true, null, null); // All slots are valid
}
    


 function recommendRestaurant(intentRequest, callback) {

    // Get the information in each slot:
    const slots = intentRequest.currentIntent.slots;
    const cuisine = slots.cuisine;
    const diningdate = slots.diningdate;
    const diningtime = slots.diningtime;
    const location = slots.location;
    const numberofpeople = slots.numberofpeople;
    const email = slots.email;
    const source = intentRequest.invocationSource;

    if (source === 'DialogCodeHook') {
        // Perform basic validation on the supplied input slots.
        // Use the elicitSlot dialog action to re-prompt for the first violation detected.

        // Check each parameter
        const validationResult = validateSlot(cuisine, location, diningdate, diningtime, numberofpeople, email);

        if (!validationResult.isValid) {    // If invalid slot exists, buildValidationResult will set isValid to false
            slots[`${validationResult.violatedSlot}`] = null;   // reset the invalid slot
            // request the invalid slot again
            callback(elicitSlot(intentRequest.sessionAttributes, intentRequest.currentIntent.name, slots, validationResult.violatedSlot, validationResult.message));
            return;
        }
    // If the slots are valid, respond to customer
    const outputSessionAttributes = intentRequest.sessionAttributes || {};
    callback(delegate(outputSessionAttributes, intentRequest.currentIntent.slots));
    return;
        
    }
    
   
    if (source === 'FulfillmentCodeHook') {
        // Load the AWS SDK for Node.js
        var AWS = require('aws-sdk');
        // Set the region 
        AWS.config.update({region: 'us-east-1'});
        
        // Create an SQS service object
        var sqs = new AWS.SQS({apiVersion: '2019-10-01'});
        
        var params = {
          DelaySeconds: 10,
          MessageAttributes: {
          },
          MessageBody: JSON.stringify({
            cuisine : cuisine,
            diningdate : diningdate,
            diningtime : diningtime,
            location : location,
            numberofpeople : numberofpeople,
            email : email }),
          // MessageDeduplicationId: "TheWhistler",  // Required for FIFO queues
          // MessageId: "Group1",  // Required for FIFO queues
          QueueUrl: "<queueurl>"
        };
        
        sqs.sendMessage(params, function(err, data) {
          if (err) {
              callback(close(intentRequest.sessionAttributes, 'Fulfilled',
                    { contentType: 'PlainText', content: 'Sorry. Some errors happened.'}));
                console.log("Error", err);
          } else {
              callback(close(intentRequest.sessionAttributes, 'Fulfilled',
              {contentType: 'PlainText', content: 'You’re all set. Expect my suggestions shortly! Have a good day'}));
              console.log("Success", data.MessageId);
          }
        });
        return;
    }
    
    
    return;

}



// --------------- Events -----------------------
 
function dispatch(intentRequest, callback) {
    console.log(`request received for userId=${intentRequest.userId}, intentName=${intentRequest.currentIntent.name}`);
    const sessionAttributes = intentRequest.sessionAttributes;
    const intentName = intentRequest.currentIntent.name;
    
    if (intentName == 'GreetingIntent') {
        callback(close(sessionAttributes, 'Fulfilled',
    {contentType: 'PlainText', content: 'Hi there, how can I help you?'}));
    }
     if (intentName == 'ThankYouIntent') {
        callback(close(sessionAttributes, 'Fulfilled',
    {contentType: 'PlainText', content: 'You are welcome. Have a nice day'}));
    }
     if (intentName == 'DiningSuggestionsIntent') {
        return recommendRestaurant(intentRequest, callback);
    }
} 
 
 
 
 
// --------------- Main handler -----------------------
 
// Route the incoming request based on intent.
// The JSON body of the request is provided in the event slot.
exports.handler = (event, context, callback) => {
    try {
        process.env.TZ = 'America/New_York';

        dispatch(event,
            (response) => callback(null, response));
    } catch (err) {
        callback(err);
    }
};