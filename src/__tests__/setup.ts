import { S3 } from "aws-sdk";
import { S3FileSystem } from "../S3FileSystem";
import config from "./secret.json";

export const fs = new S3FileSystem("univ-fs-test", "test", config);

export const setup = async () => {
  const client = new S3(config);
  const data = await client.listObjectsV2({ Bucket: "univ-fs-test" }).promise();
  for (const content of data.Contents || []) {
    await client
      .deleteObject({
        Bucket: "univ-fs-test",
        Key: content.Key as string,
      })
      .promise();
  }
};
