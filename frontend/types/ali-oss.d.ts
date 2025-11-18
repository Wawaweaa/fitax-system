// Type definitions for ali-oss
declare module 'ali-oss' {
  namespace OSS {
    interface Options {
      region?: string;
      bucket?: string;
      accessKeyId: string;
      accessKeySecret: string;
      endpoint?: string;
      secure?: boolean;
    }

    interface PutObjectOptions {
      mime?: string;
      headers?: Record<string, string>;
    }

    interface SignatureUrlOptions {
      method?: string;
      expires?: number;
      headers?: Record<string, string>;
      response?: Record<string, string>;
    }

    interface ListOptions {
      prefix?: string;
      marker?: string;
      'max-keys'?: number;
    }

    interface ListResult {
      objects?: Array<{
        name: string;
        [key: string]: any;
      }>;
      prefixes?: string[];
      nextMarker?: string;
      isTruncated?: boolean;
    }
  }

  class OSS {
    constructor(options: OSS.Options);
    put(name: string, file: Buffer | NodeJS.ReadableStream, options?: OSS.PutObjectOptions): Promise<any>;
    get(name: string): Promise<{ content: Buffer; [key: string]: any }>;
    head(name: string): Promise<any>;
    delete(name: string): Promise<any>;
    signatureUrl(name: string, options?: OSS.SignatureUrlOptions): string;
    list(options?: OSS.ListOptions): Promise<OSS.ListResult>;
  }

  export default OSS;
}