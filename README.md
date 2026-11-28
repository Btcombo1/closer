# Closer

A private place for Tabby and Brandon to walk through a hard, recurring chapter of their marriage, one small step at a time. It lives on the phone, works offline, and only syncs when you ask it to.

The center of the path is one incident from about ten years ago. The app never names it. Tabby does, in her own words, when she is ready. Brandon does not see those words until she marks them finished.

This is a companion to a licensed marriage counselor, not a replacement.

## Open it

On a phone, go to:

https://btcombo1.github.io/closer/

Add it to the home screen (Share, then Add to Home Screen on iPhone). After that it can open like an app, even with no signal.

The first screen asks whose phone it is. You can change that later in Settings.

## Connect the two phones

You can use Closer on one phone with no setup. To share answers between phones:

1. Sign in to GitHub on a computer.
2. Open **Settings**, then **Developer settings**, then **Personal access tokens**, then **Fine-grained tokens**.
3. Choose **Generate new token**.
4. Name it something like `Closer phones`.
5. Under **Repository access**, choose **Only select repositories**, and pick **closer-data**.
6. Under **Permissions**, open **Repository permissions**, and set **Contents** to **Read and write**. Leave everything else alone.
7. Generate the token and copy it. GitHub shows it only once.
8. On Brandon’s phone, open Closer and paste the token. Then choose a passphrase together. The passphrase is not the GitHub token. It is a sentence only the two of you know. Tap **Test connection**. A good result says it is connected and that `state.json` was created. If you see **401**, the token was rejected. If you see **403**, Contents is not set to Read and write. If you see **404**, the token cannot see the closer-data repo.
9. Tap **Text the setup link** and send it to Tabby. You do not have to be together. She opens it once. The secrets sit in the hidden part of the link, and the app clears them from the address bar. Delete the text after her phone is set up.

If a token is ever pasted into a text message by mistake, delete that token on GitHub, make a new one, and update both phones.

Answers stay on each phone first. When there is a signal, **Sync now** (or leaving the app open) writes the scrambled copy to the private `closer-data` repository. Photos are shrunk on the phone, then scrambled the same way, each in its own small file.

## How a day works

One step shows at a time. Tabby writes first on her steps, and Brandon cannot read that writing until she says it is finished. Then he answers. His steps go the other way. You can pause any day. Pausing is not a failure, and there is no streak.

There is a calming minute and a short verse in the ESV before the words. Anything still in progress is a draft. It autosaves, and it is scrambled so the other phone cannot read it, even after a sync. Tap **Mark finished** when you want them to see it. That copy is read-only and timestamped, and only then can they respond.

When your part of a step is done, you can stop. The other person answers when they can. You do not have to be in the same place. If the app is installed on your home screen, it can notify you when it is your turn. Open the app, or leave it in the background, and it checks for finished words every half minute.

**Phone down** is optional and solo: one small break from your own phone. A missed day is just a missed day. It does not hold up a step.

**Date nights** are ideas for when you both have time. They never hold up a step. Short ideas fit before a weekend night shift. Longer ones fit nights off. Change the nights in Settings when overtime moves them.

**Just Us** is optional, behind an extra tap, and never put on the schedule unless you add it.

The calendar shows rest days you have kept, dates, celebrations (anniversary on November 21, Tabby’s birthday on April 3, together since April 2018), and the days you were present together. Tap a day to see what happened and any photos.

## If it comes back

The record stays. You can add more to a chapter later without starting over. Ask Brandon and the journal are always there, outside the daily step.
