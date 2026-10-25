# Hostel Electricity

Hi! I built this for my hostel because splitting the light bill over WhatsApp
was getting messy.To solve the problem of Who paid? Who didn't? How many units are left on the meter?
Now it's all in one place and everyone can see the same numbers.

It's a small web app. No download, no app store. Open the link, sign in, done.

## The idea in a minute

- Our electricity is bought in advance (tokens/units), and everybody chips in.
- The treasurer sets up a **billing cycle** (a week or a month) with a total to
  collect. The total is split equally among everyone in the hostel at that time.
- You pay the treasurer the normal way (transfer, cash, whatever we agree on),
  then **record it in the app** with a screenshot.
- The treasurer checks it against their bank record and **approves** it. Only
  approved payments count.
- The treasurer also logs every token purchase and meter reading, so the app can
  estimate how many days of power we have left.

The app never moves money. It only keeps honest records.

## Getting started

**Joining (most people)**
1. Ask the treasurer for an **invitation code**. Each code works once and
   expires after 7 days.
2. Tap **Create account**. Pick a username (3 to 20 letters, numbers or
   underscore) and a password (8+ characters), and type the name you want the
   hostel to see.
3. Enter the code under **Join a hostel**.

There's no email involved, so **there is no "forgot password" button.** If you
forget it, ask the treasurer to reset it. They'll give you a temporary one, and
you should change it straight away under **People**.

**Starting a new hostel**
If you're the one setting things up, choose **Start a new hostel** instead of
entering a code. You become the treasurer. Currency is naira and the clock is
Lagos time.

## For everyone

**Home**: a meter display showing units left and days remaining, what you owe, how much of this collection is in, who has paid, and an activity calendar (tap any day to see payments, token purchases and meter readings). Below that: this collection's target, how much has been confirmed so far, and how many
people are paid, part-paid or unpaid. Below that is *your* balance: what you
owe now, any older arrears, any credit, and payments you've sent that are still
waiting for approval.

**Pay**: after you've paid the treasurer, record it here.
- Enter the amount and the date you paid (not a future date).
- Add the transaction reference if you have one.
- Attach a screenshot of the receipt. Your phone shrinks it before upload, so
  don't worry about data. No receipt? Write a short note saying why.
- Then wait for approval. You can **withdraw** a submission while it's pending.
- If you think a decision is wrong (rejected, or approved for the wrong
  amount), tap **Dispute** and say what's wrong. The treasurer has to reply and
  you'll see the outcome.

**Light**: the latest meter reading, average use per day, estimated days left,
total units bought, total spent, and whether we're holding enough money. The
estimate is for the whole hostel, not for any one person.

**People**: who's in the hostel, who the treasurer is, and who the backup is.
You can also change your password here.

## For the treasurer

You have a few extra tabs (Review, Collections, Reports under **More**).

- **Collections**: create a cycle (start, end, deadline, total in whole naira). It's
  saved as a **draft** first. Use **Preview** to see what each person would owe,
  then **Publish**. After publishing, a cycle can't be edited, only **adjusted**
  per person, with a reason that stays on record. Any leftover kobo from the
  equal split is absorbed by the treasurer.
- **Review**: approve or reject payments. A screenshot is evidence, not proof,
  so please check the bank record first. The app warns you if two payments share
  a reference. If you approve your own payment, it's marked as self-reviewed.
  You can also reverse an approval (with a reason) and answer disputes.
- **Light**: record every token purchase (amount, units, time, reference,
  screenshot) and every meter reading. Record purchases *before* readings, so a
  recharge isn't mistaken for an error. Odd readings get flagged and left out of
  the estimate. Tick "meter was replaced or reset" when that happens.
- **People**: create invitation codes (copy it straight away, it's only shown
  once), reset someone's password, remove someone who's leaving (their debt
  stays on record), name a **backup treasurer**, or hand the role over (the
  other person has to accept).
- **Reports**: everyone's balances, **Check the books** (makes sure every
  approved payment matches what was allocated), **Export CSV** for your own
  records, and **Export as image**: one clean picture of where things stand
  (collected vs target, who has paid, electricity spending, funds in hand, each
  member's balance, and whether the books check out). Post it in the group chat
  as proof. On a phone it opens the share sheet, so you can send it straight to
  WhatsApp.

## Fairness and trust

We run on trust, so the app is built to be open:
- Everything the treasurer does (approvals, reversals, adjustments, password
  resets, role changes) goes in an activity log.
- If the backup treasurer ever has to take over, they must give a reason, and
  it's shown to everyone.
- Nothing is deleted quietly. Mistakes are corrected with a visible reversal or
  adjustment.

