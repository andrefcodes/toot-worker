# Toot-Worker

**Toot-Worker** is a serverless application that automatically crossposts RSS feed content to Mastodon. It runs on Cloudflare Workers.

> By now, this application only works with the rss protocol and has a lot of room to improve.

### Step 1. Deploy this project to Cloudflare Workers

Sign up with Cloudflare, and click the button below to start deploying.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/andrefcodes/toot-worker)

Alternatively, you can clone the project and run [`wrangler deploy`](https://developers.cloudflare.com/workers/wrangler/commands/#deploy) locally.

### Step 2. Configure a KV (key-value data storage) for your worker

* Expand to the Works & Pages page on the Cloudflare dashboard, then select KV.

* Create a new namespace, and give it a name.

* Rename and update your project's wrangler.sample.toml to wrangler.toml and add your KV id.

```toml
kv_namespaces = [
  { binding = "TOOTWORKER_KV", id = "add your id here" }
]
```

### Step 3. Configure Environment Variables

Go back to the toot-worker service page on the Cloudflare dashboard, select Settings > Variables, and add the following Environment Variables to your worker:

* Type Text
    * RSS_FEED_URL: https://your.feed.rss
    * INSTANCE_URL: https://your.instanceURL.com
* Type Secret
    * ACCESS_TOKEN: Create an access token in the Development section of your mastodon account. The **only** scope necessary is `write:statuses`, then add it here.
* Bindings
    * TOOTWORKER_KV as variable. For Value, select the KV you've just created.

### Step 4. Set up cron

* Select Settings > Trigger Events

* Select Cron Trigger

* Set up using a cron expression, e.g. */30 * * * * (checks your rss feed every 30 minuts). See [Crontab Guru](https://crontab.guru/#*/30_*_*_*_*).

### [Optional] Step 5. Enable workers log

* Go to Settings > Observability

* Make sure to enable Workers Logs

### IMPORTANT

#### If deploying locally using Cloudflare Wrangler, Steps 3 and 4 can be directly configured in your wrangler.jsonc file by uncommenting the lines below.

```jsonc
	//"vars": {
	//	"RSS_FEED_URL": "your rss feed url here",
	//	"INSTANCE_URL": "your instance url here",
	//	"VISIBILITY": "public" // "unlisted", "private", or "public"
	//},

	// Scheduled triggers - Don´t uncomment this line
	//"triggers": {
	//	"crons": ["*/30 * * * *"] // Runs every 30 minutes
	//}
```

#### To no expose your ACCESS_TOKEN, you can run `npx wrangler secret put ACCESS_TOKEN`, then type the token.

#### If you are crossposting to another platform compatible with mastodon API's, like Go to Social, you can obtain your access token by following the below steps:

* **Get a client ID**:
``` bash
curl -H 'Content-Type: application/json' \
  -d '{
        "client_name": "Toot-Worker",
        "redirect_uris": "urn:ietf:wg:oauth:2.0:oob",
        "scopes": "write:statuses"
      }' \
  'https://INSTANCE_URL/api/v1/apps'
```

* **Use your browser to authenticate:**

  https://INSTANCE_URL/oauth/authorize\?client_id\=YOUR_CLIENT_ID\&redirect_uri\=urn:ietf:wg:oauth:2.0:oob\&response_type\=code\&scope\=write:statuses
  
* **Use the provided code the get your access token**
```bash  
  curl -X POST 'https://INSTANCE_URL/oauth/token' \
  -d 'client_id=YOUR_CLIENT_ID' \
  -d 'client_secret=YOUR_CLIENT_SECRET' \
  -d 'code=THE_CODE_YOU_RECEIVED_LAST_STEP' \
  -d 'redirect_uri=urn:ietf:wg:oauth:2.0:oob' \
  -d 'grant_type=authorization_code'
```

## License

Toot-worker - a serverless application that automatically crossposts RSS feed content to Mastodon.  
Copyright (C) 2025 Andre Franca

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
