import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
export async function launchBrowser(){
  const installed=['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'].find(existsSync);
  return chromium.launch({headless:true,...(installed?{executablePath:installed}:{}),args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
}
