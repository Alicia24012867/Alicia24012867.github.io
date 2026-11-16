import { configFromEnv } from './config.ts';
import { openDatabase } from './db.ts';
import { formatTime } from './html.ts';
import { createLink } from './links.ts';
import { createPerson, findPerson, isAdmin, listPeople, logEvent, type Person } from './people.ts';

/**
 * Commands for the server's shell, where the service runs in its container:
 *
 *   docker exec auth node src/cli.ts bootstrap --name <name>   the first administrator
 *   docker exec auth node src/cli.ts setup-link [<name or id>]  a new passkey link
 *   docker exec auth node src/cli.ts people                     who there is
 */
const usage = `usage:
  node src/cli.ts bootstrap --name <name>   make the first administrator, with a passkey link
  node src/cli.ts setup-link [<name or id>]  a new passkey link, for an administrator by default
  node src/cli.ts people                     list everyone`;

const config = configFromEnv();
process.umask(0o077);
const db = openDatabase(config.dataDir);
const [command, ...args] = process.argv.slice(2);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Prints a setup link, good for an hour, which makes a passkey and signs that browser in. */
function printSetupLink(person: Person) {
  const link = createLink(db, person.id, 'setup', 3600);
  logEvent(db, 'link-created', { personId: person.id, detail: 'a passkey setup link (shell)' });
  console.log(`Open this within the hour to make a passkey for ${person.name}:`);
  console.log(`  ${new URL(link.path, config.issuer).href}`);
  console.log(`It works once, until ${formatTime(link.expiresAt)}.`);
}

switch (command) {
  case 'bootstrap': {
    const at = args.indexOf('--name');
    const name = at >= 0 ? args[at + 1]?.trim() : undefined;
    if (!name) fail('bootstrap needs --name <name>, the name others see.');
    if (listPeople(db).some(isAdmin)) {
      fail('There is an administrator already. For a new passkey link, use setup-link.');
    }
    printSetupLink(createPerson(db, name, ['admin']));
    break;
  }
  case 'setup-link': {
    const people = listPeople(db);
    const wanted = args.join(' ').trim();
    const matches = wanted
      ? people.filter((person) => person.id === wanted || person.name === wanted)
      : people.filter(isAdmin);
    if (matches.length !== 1) {
      fail(
        matches.length
          ? 'More than one person matches; give an id from `people`.'
          : 'No one matches; see `people`.',
      );
    }
    const person = findPerson(db, matches[0]!.id)!;
    if (person.disabledAt !== null) fail(`${person.name} is turned off.`);
    printSetupLink(person);
    break;
  }
  case 'people':
    for (const person of listPeople(db)) {
      const state = person.disabledAt === null ? '' : ' (off)';
      console.log(`${person.id}  ${person.name}${state}  ${person.groups.join(', ')}`);
    }
    break;
  default:
    fail(usage);
}
db.close();
