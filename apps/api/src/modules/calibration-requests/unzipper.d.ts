// `unzipper` ships no bundled types and no `@types/unzipper` package is used
// here — this declares only the narrow surface this module actually calls
// (`Open.buffer`, reading ZIP central-directory metadata without extracting).
declare module "unzipper" {
  export interface UnzipperFileEntry {
    uncompressedSize: number;
    compressedSize: number;
    path: string;
    type: "File" | "Directory";
  }

  export interface UnzipperCentralDirectory {
    files: UnzipperFileEntry[];
  }

  export const Open: {
    buffer(buffer: Buffer): Promise<UnzipperCentralDirectory>;
  };
}
