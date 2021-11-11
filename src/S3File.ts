import { Readable } from "stream";
import {
  Converter,
  Data,
  isBlob,
  isBrowser,
  isBuffer,
  isNode,
  isReadable,
} from "univ-conv";
import { AbstractFile, OpenOptions, Stats, WriteOptions } from "univ-fs";
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

  // eslint-disable-next-line
  protected async _load(_stats: Stats, _options: OpenOptions): Promise<Data> {
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
    const converter = new Converter(options);

    try {
      let head: Data | undefined;
      if (options.append && stats) {
        head = await this._load(stats, options);
      }
      let body: string | Readable | ReadableStream<unknown> | Blob | Uint8Array;
      if (head) {
        if (isNode && (isReadable(head) || isReadable(data))) {
          body = await converter.merge([head, data], "Readable");
        } else if (isBrowser && (isBlob(head) || isBlob(data))) {
          body = await converter.merge([head, data], "Blob");
        } else if (typeof head === "string" && typeof data === "string") {
          body = await converter.merge([head, data], "UTF8");
        } else if (isNode) {
          body = await converter.merge([head, data], "Buffer");
        } else {
          body = await converter.merge([head, data], "Uint8Array");
        }
      } else {
        if (
          typeof data === "string" ||
          (isBrowser && isBlob(data)) ||
          (isNode && (isReadable(data) || isBuffer(data)))
        ) {
          body = data;
        } else {
          if (isNode) {
            body = await converter.toBuffer(data);
          } else {
            body = await converter.toUint8Array(data);
          }
        }
      }

      let metadata: { [key: string]: string } | undefined;
      if (stats) {
        metadata = s3fs._createMetadata(stats);
      }

      const client = await s3fs._getClient();
      const params = s3fs._createParams(path, false);
      if (isNode && isReadable(body)) {
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
