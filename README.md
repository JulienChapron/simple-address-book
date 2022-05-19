# Simple address book with Deno, Svelte and MongoDB
<a href="https://github.com/JulienChapron/simple-address-book/main/LICENSE">
 <img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="simple-address-book is released under the Public License v3.0." />
</a>

[![Code Climate](https://codeclimate.com/github/JulienChapron/simple-address-book/badges/gpa.svg)](https://codeclimate.com/github/JulienChapron/simple-address-book)
[![Total alerts](https://img.shields.io/lgtm/alerts/g/JulienChapron/simple-address-book.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/JulienChapron/simple-address-book/alerts/)
[![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/JulienChapron/simple-address-book.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/JulienChapron/simple-address-book/context:javascript)
![Known Vulnerabilities](https://snyk.io/test/github/JulienChapron/simple-address-book/badge.svg)
[![Codacy Badge](https://app.codacy.com/project/badge/Grade/7a0affbbbb58400f8fc2a77f7429006a)](https://www.codacy.com/gh/JulienChapron/simple-address-book/dashboard?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=JulienChapron/simple-address-book&amp;utm_campaign=Badge_Grade)

![alt text](https://raw.githubusercontent.com/JulienChapron/simple-address-book/master/images/app.gif)

## Tech Stack

* <img src="https://deno.land/logo.svg" alt="logo-deno" style="margin:5px;vertical-align:middle" height="50"/> Deno <https://deno.land/>
* <img src="https://pbs.twimg.com/profile_images/1121395911849062400/7exmJEg4.png" style="margin:5px;vertical-align:middle" alt="logo-svelte" height="50"/> Svelte <https://svelte.dev/>
* <img src="https://smeltejs.com/logo.svg" style="margin:5px;vertical-align:middle" alt="logo-smelte" height="50"/> Smelte <https://smeltejs.com/>
* <img src="https://www.universitylib.com/wp-content/uploads/2020/11/Mongo-db-logo.png" style="margin:5px;vertical-align:middle" alt="logo-mongoDB" height="50"/> MongoDB <https://www.mongodb.com/>

### Deno

Deno is a simple, modern and secure runtime for JavaScript and TypeScript that uses V8 and is built in Rust.
- Secure by default. No file, network, or environment access, unless explicitly enabled.
- Supports TypeScript out of the box.
- Ships only a single executable file.
- Has built-in utilities like a dependency inspector (deno info) and a code formatter (deno fmt).
- Has a set of reviewed (audited) standard modules that are guaranteed to work with Deno: deno.land/std
- Has a number of companies interested in using and exploring Deno

### Svelte

Svelte is a radical new approach to building user interfaces. Whereas traditional frameworks like React and Vue do the bulk of their work in the browser, Svelte shifts that work into a compile step that happens when you build your app.
Instead of using techniques like virtual DOM diffing, Svelte writes code that surgically updates the DOM when the state of your app changes.


## Installation and run the app with docker 🚀🚀

Get the code

```bash
git clone https://github.com/JulienChapron/simple-address-book.git
```
```bash
cd simple-address-book 
```

```bash
docker-compose up --build 
```

## Version 0.1

***Initial
