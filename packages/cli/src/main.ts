#!/usr/bin/env node
/**
 * OpenMnemo CLI — unified entry point.
 *
 * Ported from memorytree-workflow TS branch (src/cli/*).
 * Commands: init, upgrade, import, discover, locale, recall, daemon
 */

import { Command } from 'commander'

const program = new Command()

program
  .name('openmnemo')
  .description('OpenMnemo — cross-platform AI conversation memory')
  .version('0.0.1')

// Commands will be registered here as modules are ported.

program.parse()
