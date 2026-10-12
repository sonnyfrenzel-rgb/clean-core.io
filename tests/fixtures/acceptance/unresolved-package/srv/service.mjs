// Fixture: a package whose service imports a web framework that is not
// installed. The harness must report it as not runnable, never install it.
import express from 'express';

export function createApp() {
  return express();
}
