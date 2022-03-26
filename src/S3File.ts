import { Readable } from "stream";
import {
  blobConverter,
  Data,
  hasBuffer,
  readableConverter,
  readableStreamConverter,
} from "univ-conv";
import { AbstractFile, ReadOptions, Stats, WriteOptions } from "univ-fs";
import { S3FileSystem } from "./S3FileSystem";

export class S3File extends AbstractFile {
  constructor(private s3fs: S3FileSystem, path: string) {
    super(s3fs, path);
  }

  public async _rm(): Promise<void> {
    const s3fs = this.s3fs;
    const path = this.path;

    try {
      const client = await s3fs._getClient();
      await client.deleteObject(s3fs._createParams(path, false)).promise();
    } catch (e) {
      throw s3fs._error(path, e, true);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected async _load(_1: Stats, _2: ReadOptions): Promise<Data> {
    const s3fs = this.s3fs;
    const path = this.path;

    try {
      const client = await s3fs._getClient();
      const obj = await client
        .getObject(s3fs._createParams(path, false))
        .promise();
      return (obj.Body as Data) || "";
    } catch (e) {
      throw s3fs._error(path, e, false);
    }
  }

  protected async _save(
    data: Data,
    stats: Stats | undefined,
    options: WriteOptions
  ): Promise<void> {
    const s3fs = this.s3fs;
    const path = this.path;
    const converter = this._getConverter();

    try {
      let head: Data | undefined;
      if (options.append && stats) {
        head = await this._load(stats, options);
      }
      let body: Readable | ReadableStream<unknown> | Blob | Uint8Array;
      /* eslint-disable */
      if (head) {
        if (
          readableConverter().typeEquals(head) ||
          readableConverter().typeEquals(data)
        ) {
          body = await converter.merge([head, data], "readable", options);
        } else if (
          readableStreamConverter().typeEquals(head) ||
          readableStreamConverter().typeEquals(data)
        ) {
          body = await converter.merge([head, data], "readablestream", options);
        } else if (
          blobConverter().typeEquals(head) ||
          blobConverter().typeEquals(data)
        ) {
          body = await converter.merge([head, data], "blob", options);
        } else if (hasBuffer) {
          body = await converter.merge([head, data], "buffer", options);
        } else {
          body = await converter.merge([head, data], "uint8array", options);
        }
      } else {
        if (readableConverter().typeEquals(data)) {
          body = await converter.convert(data, "readable", options);
        } else if (readableStreamConverter().typeEquals(data)) {
          body = await converter.convert(data, "readablestream", options);
        } else if (blobConverter().typeEquals(data)) {
          body = await converter.convert(data, "blob", options);
        } else if (hasBuffer) {
          body = await converter.toBuffer(data);
        } else {
          body = await converter.toUint8Array(data);
        }
      }

      let metadata: { [key: string]: string } | undefined;
      if (stats) {
        metadata = s3fs._createMetadata(stats);
      }

      const client = await s3fs._getClient();
      const params = s3fs._createParams(path, false);
      if (
        readableConverter().typeEquals(body) ||
        readableStreamConverter().typeEquals(body)
      ) {
        const readable = converter.toReadable(body);
        await client
          .upload({ ...params, Body: readable, Metadata: metadata })
          .promise();
      } else {
        const length = await converter.getSize(body);
        await client
          .putObject({
            ...params,
            Body: body,
            ContentLength: length,
            Metadata: metadata,
          })
          .promise();
      }
    } catch (e) {
      throw s3fs._error(path, e, true);
    }
  }
}
