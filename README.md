# LeetCode to Notion

A Chrome extension to save LeetCode problem records into your Notion database.

## What It Is Used For

- Track solved problems from `leetcode.com` / `leetcode.cn`
- Log time spent, notes, status, and metadata
- Avoid duplicate entries with problem-number matching

## Technology Used

- Chrome Extension (Manifest V3)
- JavaScript (Vanilla)
- HTML/CSS
- Notion REST API
- Chrome APIs: `storage`, `activeTab`, `scripting`, `alarms`

## How To Use

1. Load extension in Chrome (`chrome://extensions` -> Developer mode -> Load unpacked).
2. Open **Options** and enter Notion token + database ID.
3. Open a LeetCode problem page.
4. Open extension popup, start timer, set fields, click **Save**.

Done.
