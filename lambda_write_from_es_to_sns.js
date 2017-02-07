/* == Imports == */
var AWS = require('aws-sdk');
var path = require('path');

/* == Globals == */
const ES_REGION = 'us-west-2';
const ES_ENDPOINT = 'es.yourdomain.com';
const SNS_TOPIC_ARN = 'arn:aws:sns:us-west-2:<your_account>:es-sns';
const THRESHOLD = 1;
const ES_ROLE = 'arn:aws:iam::<your_account>:role/role_name';
const ROLE_SESSION_NAME = "demo2";

console.log('Launching...');

exports.handler = function(event, context) {

  /* Get AWS credentials to sign request */
  // var creds = new AWS.EnvironmentCredentials('AWS');
  
  var sts = new AWS.STS({apiVersion: '2011-06-15'});
  sts.assumeRole({
    RoleArn: ES_ROLE,
    RoleSessionName: ROLE_SESSION_NAME,
    DurationSeconds: 60 * 20,
  }, (err, data)=>{
    //callback handling
      var creds = data.Credentials;
      requestEs(creds, context);
  });
}

function requestEs(creds, context) {

  var endpoint = new AWS.Endpoint(ES_ENDPOINT);
  var req = new AWS.HttpRequest(endpoint);
  var query = {};

  /* Set the HTTP request parameters */
  req.method = 'POST';

  today = new Date();
  req.path = '/_search?pretty';

  req.region = ES_REGION;
  req.headers['presigned-expires'] = false;
  req.headers['Host'] = endpoint.host;
  req.headers['content-type'] = 'application/json';

  req.body = JSON.stringify(query);

  var signer = new AWS.Signers.V4(req , 'es');
  signer.addAuthorization(creds, new Date());

  var send = new AWS.NodeHttpClient();
  send.handleRequest(req, null, function(httpResp) {
  var respBody = '';

    //Build the response
    httpResp.on('data', function (chunk) {
      respBody += chunk;
    });

    httpResp.on('end', function (chunk) {
      resp = JSON.parse(respBody);
      console.log("Response: " + JSON.stringify(resp));

      // push SNS
      if (resp.hits.total > THRESHOLD) {
        publishToSNS(resp.hits.total, context);
      }
    });
  },

  function(err) {
    context.fail('Lambda failed with error ' + err);
  });
}

function publishToSNS(hits, context) {

  var sns = new AWS.SNS();
  
  sns.publish({
  Message: 'Total hits from /_search?pretty ' + hits,
  TopicArn: SNS_TOPIC_ARN
  }, function(err, data) {
    if (err) {
      context.fail('Failed to publish to SNS ' + err);
    }
    context.done(null, 'Function Finished!');
  });
}