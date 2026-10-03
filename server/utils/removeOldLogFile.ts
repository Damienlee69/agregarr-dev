import fs from 'fs';

export const removeOldLogFile = (file: string): void => {
  try {
    if (!fs.lstatSync(file).isSymbolicLink()) {
      fs.unlinkSync(file);
    }
  } catch (e) {
    // parallel test workers import the logger at once and race to unlink
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
};
