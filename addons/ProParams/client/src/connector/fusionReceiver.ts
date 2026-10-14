/*
 * Copyright (c) 2022 Patrick Rainsberry
 * Permission to use, copy, modify, and distribute this software in object code form
 * for any purpose and without fee is hereby granted, provided that the above copyright
 * notice appears in all copies and that both that copyright notice and the limited
 * warranty and restricted rights notice below appear in all supporting documentation.
 *
 * THIS PROGRAM IS PROVIDED "AS IS" AND WITH ALL FAULTS. THE PUBLISHER SPECIFICALLY
 * DISCLAIMS ANY IMPLIED WARRANTY OF MERCHANTABILITY OR FITNESS FOR A PARTICULAR USE.
 * THE PUBLISHER DOES NOT WARRANT THAT THE OPERATION OF THE PROGRAM WILL BE
 * UNINTERRUPTED OR ERROR FREE.
 */

// Configure the max number of retries if the adsk object hasn't been loaded
const MAX_RETRIES = 30;

export type FusionMessageHandler = (action: string, messageString: string) => string;

let _handler: FusionMessageHandler = (action) => {
  if (action === 'debugger') debugger;
  return 'OK';
};

export function setFusionMessageHandler(handler: FusionMessageHandler) {
  _handler = handler;
  // If Fusion is already ready, update immediately.
  if (window.adsk) {
    window.fusionJavaScriptHandler = { handle: _handler };
  }
}

// In some cases, especially with larger page loads like with React,
// the adsk object may not be available immediately during page load.
// In that case we will retry a few times to ensure our event handler is registered.
export function checkADSK(handler?: FusionMessageHandler) {
  if (handler) setFusionMessageHandler(handler);

  let attempts = 0;
  const adskWaiter = setInterval(function () {
    if (attempts > MAX_RETRIES) {
      clearInterval(adskWaiter);
    } else if (window.adsk) {
      clearInterval(adskWaiter);
      window.fusionJavaScriptHandler = { handle: _handler };
    }
    attempts += 1;
  }, 250);
}



