'use strict';

// [START import]

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();
const spawn = require('child-process-promise').spawn;
const path = require('path');
const os = require('os');
const fs = require('fs');
const cors = require("cors")({ origin: true });
const Busboy = require("busboy");

const gcconfig = {  
  projectId: "picture-notes-38f03",
  keyFilename: "service-account-credentials.json"
};

const gcs = require('@google-cloud/storage')(gcconfig);

// [END import]

// [START generateThumbnail]
/**
 * When an image is uploaded in the Storage bucket We generate a thumbnail automatically using
 * ImageMagick.
 */
// [START generateThumbnailTrigger]
exports.generateThumbnail = functions.storage.object().onFinalize((object) => {
// [END generateThumbnailTrigger]
  // [START eventAttributes]
  console.log('Object>>>>>>>', object)
  const fileBucket = object.bucket; // The Storage bucket that contains the file.
  const modifiedName = object.name.split("_");
  const uidPart = modifiedName[2].split(".");
  const uid = uidPart[0];
  const filePath = object.name; // File path in the bucket.

  const contentType = object.contentType; // File content type.
  const metageneration = object.metageneration; // Number of times metadata has been generated. New objects have a value of 1.
  // [END eventAttributes]

  // [START stopConditions]
  // Exit if this is triggered on a file that is not an image.
  if (!contentType.startsWith('image/')) {
    console.log('This is not an image.');
    return null;
  }

  // Get the file name.
  const fileName = path.basename(filePath);
  // Exit if the image is already a thumbnail.
  if (fileName.startsWith('thumb_')) {
    console.log('Already a Thumbnail.');
    return null;
  }
  // [END stopConditions]

  // [START thumbnailGeneration]
  // Download file from bucket.
  const bucket = gcs.bucket(fileBucket);
  const tempFilePath = path.join(os.tmpdir(), fileName);
  const metadata = {
    contentType: contentType,
  };

  const thumbFileName = `thumb_${fileName}`;
  const thumbFilePath = path.join(path.dirname(filePath), thumbFileName);

  const file = bucket.file(filePath);
  const thumbFile = bucket.file(thumbFilePath);

  return bucket.file(filePath).download({
    destination: tempFilePath,
  }).then(() => {
    console.log('Image downloaded locally to', tempFilePath);
    // Generate a thumbnail using ImageMagick.
    return spawn('convert', [tempFilePath, '-thumbnail', '400x400>', tempFilePath]);
  }).then(() => {
    console.log('Thumbnail created at', tempFilePath);
    // We add a 'thumb_' prefix to thumbnails file name. That's where we'll upload the thumbnail.
    console.log('Thumbnail File Path', thumbFilePath);

    // Uploading the thumbnail.
    return bucket.upload(tempFilePath, {
      destination: thumbFilePath,
      metadata: metadata,
    });
    // Once the thumbnail has been uploaded delete the local file to free up disk space.
  }).then(() => {
    fs.unlinkSync(tempFilePath);

    // Get the Signed URLs for the thumbnail and original image.
    const config = {
      action: 'read',
      expires: '03-01-2500'
    };
    return Promise.all([
      thumbFile.getSignedUrl(config),
      file.getSignedUrl(config)
    ]);
  }).then(results => {
    console.log(results);
    console.log('Got Signed URLs.');
    const thumbResult = results[0];
    const originalResult = results[1];
    const thumbnailUrl = thumbResult[0];
    const originalUrl = originalResult[0];
    console.log('uid in generateThumbnail', uid);
    const image = {
      id: new Date().getTime(),
      name: fileName,
      originalUrl: originalUrl,
      thumbnailUrl: thumbnailUrl
    };
    
    return admin
      .database()
      .ref(`users/${uid}/image/${image.id}`)
      .set(image)
      .then(res => {
        console.log(res);
      })
      .catch(error => {
        console.log('Error in set database',error);
      });
  });
  // [END thumbnailGeneration]
});
// [END generateThumbnail]


// [upload file start]
exports.uploadFile = functions.https.onRequest((req, res) => {
  cors(req, res, () => {
    if (req.method !== "POST") {
      return res.status(500).json({
        message: "Not allowed"
      });
    }
    const busboy = new Busboy({ headers: req.headers });
    let uploadData = null;

    busboy.on("file", (fieldname, file, filename, encoding, mimetype) => {
      const filepath = path.join(os.tmpdir(), filename);
      uploadData = { file: filepath, type: mimetype };
      file.pipe(fs.createWriteStream(filepath));
    });

    busboy.on("finish", () => {
      const bucket = gcs.bucket("picture-notes-38f03.appspot.com");
      bucket
        .upload(uploadData.file, {
          uploadType: "media",
          metadata: {
            metadata: {
              contentType: uploadData.type
            }
          }
        })
        .then(() => {
          res.status(200).json({
            message: "It worked!"
          });
        })
        .catch(err => {
          res.status(500).json({
            error: err 
          });
        });
    });
    busboy.end(req.rawBody);
  });
});
// [upload file end]