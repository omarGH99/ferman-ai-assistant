# What Ferman does, and how to test it

App: your own deployment, or http://localhost:7860 when running locally (see ../README.md)

On a scale-to-zero host, the first load after ~15 minutes idle takes 15–30 seconds while the container
wakes and loads both models. That is expected on a scale-to-zero host, not a
fault. Every later request is fast until it goes idle again.

---

## Part 1 — What the app can do

### The assistant (Chat tab)

You type or speak a command in English, Arabic or Kurdish. Two fine-tuned
XLM-RoBERTa models run on the server: one picks the **intent** (what you want),
the other extracts the **slots** (the date, time, title, place inside your
sentence). The app then does something with that.

The model knows **34 intents**. They fall into two groups, and the difference
matters when you test:

**21 intents that actually do something** — these change data or fetch a real
answer:

| What you say | What happens |
|---|---|
| "remind me to call mum at 7pm tomorrow" | Creates a reminder with the date and time pulled out of the sentence |
| "set an alarm for 6:30" | Creates an alarm |
| "what alarms do I have" / "delete my 6am alarm" | Lists or removes them |
| "add milk to my shopping list" | Adds to a named list, creating the list if new |
| "what's on my list" / "remove bread" | Reads or edits it |
| "what's on my calendar Friday" | Reads events for a day |
| "what's the weather in Duhok" | Live forecast |
| "what's the news" | Live headlines in your language |
| "what time is it in London" / "convert 3pm to Baghdad time" | Real conversion |
| "what is 15% of 240" | Calculates it |
| "how many dinars is 100 dollars" | Live IQD rate |
| "who is Ibn Sina" / "what is photosynthesis" | Looks it up on Wikipedia and answers |
| "where is Espresso Lab" | Opens Maps or Waze |
| "email Omar about the meeting" | Opens your email app with it drafted |
| "hello" / "tell me a joke" | Replies |

**13 intents that only reply politely** — the model recognises these but there
is no feature behind them yet. They return a canned sentence. This is by
design, not a bug, but it is the single most likely thing to disappoint a
tester who does not know:

taxi booking, ticket booking, traffic, general transport, takeaway ordering,
recipes and cooking questions, film and event recommendations, adding or
finding a contact by voice, and general chit-chat.

**When the model is unsure**, it does not guess. If confidence is below the
floor, or the top two intents are too close together, you get a "not sure what
you meant" card offering the likeliest options to tap. Tapping one both runs it
and teaches the system — see Data collection below.

### The feed (Today tab)

14 widgets, each toggleable and re-orderable in Settings, each either full or
half width:

weather · forecast · air quality · tasks · upcoming · shopping · water intake ·
prayer times · holidays · IQD currency · crypto top 10 · news · trending ·
history (on this day)

Several rotate through their content on a loop. Tapping a widget's header opens
the matching full screen.

### Lists tab

Five tabs: tasks, reminders, alarms, shopping, contacts. Shopping supports
multiple named lists. Excel import lives here. So does **list sharing**: you
generate a 6-character code, someone else enters it, and they get a copy of the
list. It is a copy, not a live sync — see the note in Part 2.

### Calendar tab

Month view of everything scheduled, with holidays included.

### Settings

Language (English/Arabic/Kurdish), theme (light/dark), city, prayer calculation
method, prayer alerts, quiet hours, widget layout, data collection consent,
account (username, password), Excel import, feedback, how-to and about.

---

## Part 2 — Test plan

Work through it in order. Each numbered item says what to do and what should
happen. If something does not match, note the exact words you typed and the
language you were in — that detail is what makes a report fixable.

### A. Getting in

1. Open the URL on a phone. Sign up with a new account. You should land in
   onboarding, which asks your language, city and whether you consent to data
   collection.
2. Sign out, sign back in. Your data should still be there.
3. Sign in on a **second device** with the same account. Add a task on one; it
   should appear on the other after a refresh.

### B. The assistant — the 21 real intents

Test each in **all three languages**, not just English. Say the same thing three
ways.

4. **Reminders**: "remind me to call the bank tomorrow at 3pm". Check the
   reminder appears in Lists → reminders with the **right date and right time**.
   The date and time are the part most likely to be wrong.
5. **Alarms**: set one, list them, delete one.
6. **Shopping**: "add rice to my kitchen list", then "what's on my kitchen
   list", then remove an item. Confirm the named list was created.
7. **Calendar**: add an event, then ask what is on that day.
8. **Weather**: ask for your city and for a different city.
9. **News**: ask in each language; headlines should come back in that language.
10. **Time and maths**: "what time is it in Tokyo", "what is 20% of 350".
11. **Currency**: "100 dollars in dinars". Sanity-check the number against a
    search.
12. **Wikipedia**: "who is Saladin", "what is a black hole". The answer should
    be a real summary, not a disambiguation page.
13. **Maps**: "where is Family Mall" — should open Maps or Waze with it.
14. **Email**: "email Ahmed about tomorrow" — should open your mail app.

### C. The assistant — the honest failure cases

These are expected behaviours. Confirm they behave *gracefully*, not correctly.

15. Ask for a taxi, a recipe, a film recommendation. You should get a polite
    canned reply, not an error and not a wrong action.
16. Say something completely outside the app: "play some music", "book me a
    flight to Paris". You should get the "not sure what you meant" card — **not**
    a confident wrong action. This is the single most important test in this
    document. A wrong confident action is much worse than an admission of
    doubt.
17. Tap one of the suggested intents on that card. It should run it, and if you
    consented to data collection, record the correction.

### D. Kurdish specifically

Kurdish is the weakest language in the models — measured at 0.70 accuracy for
Sorani against 0.89 for English, and it is the one language the v2 models did
not improve. Test it harder than the others.

18. Ask the same five commands in Sorani and in Badini. Note every one that is
    misread. **Write down the exact sentence.** These reports are the raw
    material for fixing it; nothing else will.
19. Specifically try questions where the question word comes last, e.g.
    "هەولێر چیە". This shape has been wrong before.

### E. Arabic slots specifically

Arabic intent recognition is good (0.82), but Arabic **slot** extraction is
effectively untrained — 304 annotated examples against 11,097 for English, and
none in the test set, so it has never been measured.

20. Give the same reminder in English and in Arabic, both with a date and a
    time. Check whether the Arabic one keeps them. This is a known blind spot
    and a real answer here would be genuinely useful.

### F. The feed

21. Turn every widget off, then on again one at a time. Each should appear and
    disappear.
22. Set two widgets to half width next to each other. Then turn one off — the
    remaining one should go full width, not leave a gap.
23. Reorder widgets. Reload the page. The order should stick, and should follow
    you to another device.
24. Tap each widget header. Tasks → tasks list, shopping → shopping, and so on.
25. Let the rotating widgets cycle. Nothing should flicker or go blank.
26. Water: set a target, log some, reload. It should persist, and reset the
    next day rather than carrying over.

### G. Lists and sharing

27. Create a list, share it, note the code. On a **different account**, enter
    the code. The list should arrive.
28. Confirm it is a **copy**: tick something off on the recipient's side and
    check the sender does not see it. Only the creator sees their own ticks.
    This is intended — the sync model allows one writer per account, and live
    two-way sharing would silently lose data.
29. Excel import: import a file of tasks, confirm the count matches.

### H. Calendar and prayer

30. Check holidays appear on the right dates.
31. Prayer times: confirm they look right for your city, and that "next prayer"
    is actually the next one.
32. Enable prayer alerts and quiet hours. Confirm no alert fires inside quiet
    hours, including a quiet window that crosses midnight.

### I. Settings and language

33. Switch to Arabic and to Kurdish. The whole interface should flip to
    right-to-left. Look for anything still pointing the wrong way — arrows,
    chevrons, alignment.
34. Switch between light and dark theme on every screen.
35. Change your username and password; sign out and back in with the new ones.

### J. Design check (new — deployed today)

36. Compare the Today feed with Lists and Settings. Spacing and card depth
    should feel like one app, not three.
37. Look at dark mode specifically. Cards should separate by brightness, not by
    a grey halo around them.
38. On Arabic and Kurdish, check no text is slanted/italic. There is no italic
    form in those scripts and it looks broken when faked.

### K. Native app, if you build the APK

See `mobile/BUILD.md`. The one thing worth testing there and nowhere else:

39. Set a reminder two minutes out, **fully close the app**, lock the phone. The
    notification must still fire. On the web it will not — that is the entire
    reason the native build exists.

---

## What to write down

For anything wrong:

- the exact sentence you typed, copy-pasted, not retyped from memory
- the language you were using
- what you expected, and what happened
- whether it was on phone or desktop

Command-level reports in Kurdish and Arabic are worth more than anything else
here. The models can only be improved with real examples of them failing, and
right now nearly every collected command is from one person.

## One thing to ask testers directly

Data collection consent is **off** unless someone turned it on. Every command a
tester runs with it off is invisible and cannot be used to improve the models.
Ask each tester to open Settings and switch it on — otherwise this whole
exercise produces no training data.
