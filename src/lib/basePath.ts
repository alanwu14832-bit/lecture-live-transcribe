/** 建置時決定的站台前綴（GitHub Pages 是 /<repo>/），拿來組 public/ 裡檔案的 URL */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const WORKLET_URL = `${BASE_PATH}/pcm-worklet.js`;
