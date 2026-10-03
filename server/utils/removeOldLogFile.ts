import fs from 'fs';

export const removeOldLogFile = (file: string): void => {
  let st: fs.Stats;
  try {
    st = fs.lstatSync(file);
  } catch {
    return;
  }
  if (st.isSymbolicLink()) return;

  try {
    fs.unlinkSync(file);
  } catch (e) {
    // parallel test workers import the logger at once and race to unlink
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  }
};
