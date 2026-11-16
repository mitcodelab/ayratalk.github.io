# TalkBoard AAC v1.3.8

TalkBoard is an offline-capable, installable augmentative and alternative communication (AAC) web app. This v1.3.8 release preserves the original v1.3 AAC features and local data format, with a full-width responsive board that expands tiles and artwork across the available screen, locked-accessible Phrases, and unlocked editing of built-in and custom boards and tiles.

## Features carried into this copy

- AAC boards and tiles, including caregiver edits to built-in boards and custom boards
- Text-to-speech and locally uploaded audio clips
- Favorites, recent tiles, saved phrases, and local usage trends
- Mobile-friendly layout, high contrast, larger tiles, keyboard access, and caregiver editing lock
- Import/export backups and offline PWA caching

## v1.2 additions

- **Support handoff for Genesys Cloud, NICE CXone, and Twilio-connected support channels.** The Support tab can be used while caregiver editing is locked. An organization can configure its public contact route in `support-config.js`.
- **AAC-friendly message preparation.** The user can bring in the current board message, choose a quick phrase or saved phrase, and edit the text.
- **User-controlled sharing.** The app requires a review and confirmation checkbox before opening a contact route. Web chat copies the reviewed text and opens the organization’s support page. SMS opens the phone’s messaging app with a draft; the user presses Send there.
- **Mobile call handoff.** A configured phone route can open the phone dialer. TalkBoard does not claim to inject its speaker audio into an active phone call.
- **Privacy updates.** Support drafts are not saved by TalkBoard or sent in the background. The privacy notice explains that the external service receives information only after the user pastes or sends it there.
- **Reddit and AAC-user research.** The rationale and sources are listed below. First-person posts informed user-control, response-time, quick-message, and alternate-access choices.

## Claude v1.1 board content merged

Compared with the supplied Claude v1.1 build, v1.2 already contained all 8 built-in boards and all 116 unique tile IDs, so none were duplicated. This merge carries over the personalized **“My Name is Ayra”** tile and its `x_ayra.webp` artwork. It also puts the existing greeting tiles on Quick Access, matching the supplied board layout, while keeping the Social board’s question and response tiles. The new artwork is included in the offline service-worker cache.

## Configure the support routes

Edit `support-config.js` and add public contact details. Example:

```js
window.TALKBOARD_SUPPORT_CONFIG = {
  businesses: [
    {
      id: 'clinic-chat',
      name: 'Clinic chat',
      provider: 'genesys', // genesys | nice | twilio
      channel: 'web',      // web | sms | call
      url: 'https://clinic.example.org/contact'
    },
    {
      id: 'clinic-sms',
      name: 'Text clinic support',
      provider: 'twilio',
      channel: 'sms',
      phone: '+61400000000'
    }
  ]
};
```

For `channel: "web"`, use an HTTPS page where the organization has deployed its Genesys Messenger or NICE CXone chat experience. For Twilio SMS, use the public E.164 phone number that the organization has connected to its Twilio/contact-center routing. A `channel: "call"` route accepts an E.164 number and opens the device dialer.

Do not place credentials, API keys, access tokens, patient details, or private customer records in `support-config.js`; browsers download that file. Genesys and NICE admins must deploy and configure their own contact-center chat page and routing. Twilio admins must configure the phone number and downstream routing. This release uses user-controlled handoffs to those configured channels; it does not create a vendor SDK session or unified inbox inside TalkBoard. A direct embedded SDK or API integration would require the organization’s tenant setup and, where applicable, a secure server for authentication.

## v1.3.6 board and tile editing

The app stays build-free at runtime. `index.html` contains the accessible page structure and critical first-screen styles; `styles.css` is preloaded without blocking startup and applied when its fetch completes. Board tiles adapt to available width, with standard tiles capped at 180px and larger preference tiles capped at 240px. Phrases sits beside Home and stays available while locked. When unlocked, caregivers can add, move, edit, and delete tiles on built-in or custom boards, including changing labels, pictures, colors, and audio. Boards can be deleted from the board toolbar; Home remains as the required main board. Built-in edits and deleted-board choices persist locally and are included in JSON backups. Support appears after unlock and returns to Home when the app is locked. Large boards render visible tiles first, then yield while adding later tiles; off-screen rows use intrinsic-size containment. Tile search filters the existing grid, tile actions use one delegated click handler, and the service worker caches the app and artwork for offline use.

## v1.3.7 responsive layout

The layout follows the original AyraTalk site's adaptive board rhythm: standard tiles use three columns on phones, four on mid-sized screens, and five on wide screens, while Large Tiles use two, three, and four columns. Standard cards stay capped at 180px and Large Tile cards at 240px. Container queries let the board react to its actual available width, with viewport breakpoints as a fallback. Home and Phrases remain grouped in the centered navigation. The message composer rearranges its controls on narrow phones; caregiver actions and settings reflow before they crowd; safe-area padding protects edge controls; and short landscape screens keep readable text sizes while allowing the board content to scroll.

## v1.3.8 full-width boards

The Home content and tile grid now use the full available width instead of stopping at 1,320px and 180px. Tiles remain in three, four, or five columns across phone, mid-sized, and wide screens, and Large Tiles use two, three, or four columns. Wider screens therefore expand each tile across its share of the page, like the original layout. Artwork now uses the original 62% tile width with a 172px maximum from the first render, so it grows with the tile instead of staying at the small 72px first-screen size.

## Mobile and offline use

Open the site once over HTTPS, then add it to the phone home screen from the browser menu. The AAC board and installed app shell work offline after caching. The Support tab can prepare a draft offline, but opening a support website, starting SMS, or calling requires the relevant phone service and network access. For SMS, the receiving team is responsible for replying through its configured channel.

## Local development

This is a static site with no runtime package install or build step. You can open `index.html` directly for local use; the stylesheet and artwork sizes are tested in `file://` mode. Serve the repository root over HTTP or HTTPS to enable the service worker and PWA installation. The page structure and critical styles are in `index.html`, remaining styles are in `styles.css`, app code is in `js/`, offline caching is in `sw.js`, PWA metadata is in `manifest.webmanifest`, and public support routes are in `support-config.js`.

### Browser smoke checks and artwork updates

Install the development tools with `npm ci`, install Chromium with `npx playwright install chromium`, then run `npm test`. The smoke suite covers board search and tile actions, `file://` artwork sizing, large-board rendering and filtering, the script CSP, artwork-cache consistency, and an offline reload. GitHub Actions runs the same checks for pushes and pull requests.

When adding or replacing source artwork, install Pillow with `python -m pip install -r tools/requirements-art.txt`, then run `python tools/generate-art-assets.py`. It regenerates the 128px variants, synchronizes the service-worker artwork list, and increments the cache version when any cached artwork changes. `python tools/generate-art-assets.py --check` checks the artwork set without rewriting it.

## Data and privacy

Boards, preferences, favorites, phrases, usage history, and audio clips are kept in the current browser profile. They are not synchronized. The caregiver PIN gates editing but does not encrypt browser storage. Support drafts exist only in the open page while being prepared. A user has to review and explicitly continue; TalkBoard then copies the text to the clipboard or places it in a phone SMS draft. The user completes sending in the external service. See [Privacy Policy](privacy-policy.html).

## Research and design rationale

Public first-person discussions described different communication needs across autistic users, people with acquired brain injuries, stroke survivors, and people with ALS. Recurring themes included having fast, personal phrases ready; being allowed time to respond; keeping control over what gets said; accepting typed communication; supporting different motor access methods; and communicating emergency or support preferences. The quick phrases and explicit review step are optional and editable so the app does not speak for someone or assume one AAC style works for everyone.

Reddit posts are lived-experience anecdotes, not clinical evidence or a representative survey. They are included to make the source trail visible, not to generalize from individual posters.

### Reddit discussions

- [AAC use and shutdowns in r/HighSupportNeedAutism](https://www.reddit.com/r/HighSupportNeedAutism/comments/1920zz7/mind_sharing_your_experience_with_aac/) — scripts, yes/no messages, symbol and typing preferences, and personal vocabulary.
- [A new AAC user after losing speech in r/AACusers](https://www.reddit.com/r/AACusers/comments/1vj5vym/new_to_aac_and_rant/) — social friction, response time, and the adjustment to using AAC.
- [An autistic adult’s AAC experience in r/slp](https://www.reddit.com/r/slp/comments/1u9pe6j/how_i_use_an_aac_as_a_msn_autistic_woman/) — an emergency page and communication preferences during shutdown.
- [ALS and learning eye-gaze AAC in r/ALS](https://www.reddit.com/r/ALS/comments/1e4f46x) — access setup, caregiver concerns, shortcuts, and positioning.
- [ALS access devices and mounting in r/ALS](https://www.reddit.com/r/ALS/comments/1kjjtkd) — hardware and positioning needs as access changes.
- [Word-finding and communication after a car accident in r/TBI](https://www.reddit.com/r/TBI/comments/1clluf6) — frustration and the use of text to communicate.
- [A family’s severe TBI experience in r/TBI](https://www.reddit.com/r/TBI/comments/1vyqhss/trying-to-understand-how-the-brain-works-after/) — speech loss and gesture-based responses.
- [Communication after stroke in r/stroke](https://www.reddit.com/r/stroke/comments/1wp8jkh/what-are-the-best-ways-to-communicate-with-people/) — planning accessible ways to communicate when speech or texting is difficult.

### AAC and communication-partner sources

- [AAC user perspectives in the research literature (PMC)](https://pmc.ncbi.nlm.nih.gov/articles/PMC9612935/)
- [Aphasia communication-partner focus groups (Frontiers in Communication)](https://www.frontiersin.org/journals/communication/articles/10.3389/fcomm.2023.1219331/full)
- [Best Practices for Online Meetings with AAC Users, written by AAC users (CommunicationFIRST)](https://communicationfirst.org/wp-content/uploads/2024/08/Best-Practices-for-Online-Meetings-with-AAC-Users-by-AAC-Users-v1.pdf)

### CCaaS platform sources

- [Genesys Cloud: get started with web messaging](https://help.genesys.cloud/articles/get-started-with-web-messaging/) — business admins configure Messenger and its deployment; custom messaging uses Genesys APIs/SDKs and tenant setup.
- [Genesys Cloud: Mobile Messenger overview](https://help.genesys.cloud/articles/mobile-messenger-overview/) — native mobile Messenger option for organizations building native applications.
- [NICE CXone Digital Chat Web SDK](https://help.nicecxone.com/content/ACD/digital/chatsdk/chatwebsdk.htm) — SDK setup, channel configuration, OAuth, sending and receiving chat messages.
- [Twilio Conversations overview](https://www.twilio.com/docs/conversations-classic/overview) and [creating access tokens](https://www.twilio.com/docs/conversations-classic/create-tokens) — browser Conversations clients require server-generated short-lived access tokens.
- [Twilio Voice JavaScript SDK](https://www.twilio.com/docs/voice/sdks/javascript) — browser voice integration requires a configured server-side call flow and access token.

## Version scope

v1.3.8 preserves the provider-aware contact handoff and AAC-informed message preparation from v1.2. It follows the original v1.3 app, the v1.3.1 frontend modernization, and the v1.3.2 implementation of researched performance and quality improvements. Release notes are in [CHANGELOG.md](CHANGELOG.md). It does not include a clinical validation, a production CCaaS tenant, or organization credentials. Test the app with AAC users and their chosen communication partners before relying on it in care or emergency settings.
