//THE DATABASE IS CALLED "imageboard" IN PSQL.
//Default user is same as placeholder
const bcrypt = require("bcryptjs");
const express = require('express')
const multer  = require('multer')
const upload = multer({ dest: 'uploads/' })
const app = express()
//Passport nonsense here
app.use(express.urlencoded({ extended: false }));
const fs = require("fs");
const path = require("path");
const port = 3000
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require('passport-local').Strategy;
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
app.use(
  session({
    secret: 'change_this_secret',   //change to a random string
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());
app.use("/uploads", express.static("uploads"));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));


//Basic webpage .get statements and user check
app.use((req, res, next) => {
  res.locals.currentUser = req.user || null;
  next();
});

app.get('/', async (req, res) => {
  const folderObj = await prisma.folder.findMany()
  res.render('index', { folderObj })})

app.get('/upload', (req, res) => {res.render('upload')})

app.get('/login', (req, res) => {res.render('login')})


//Log in functions
app.post("/sign-up", async (req, res) => {
  try {
    const hashedPassword = await bcrypt.hash(req.body.password, 10);
    let userData = {
      username: req.body.username,
      password: hashedPassword,
    };
    await prisma.user.create({
      data: userData,
    });
    res.redirect("/");
  } catch (err) {
    if (err.code === "P2002") {
      return res.status(400).send("Username already taken");
    }
    console.error("Error signing up", err);
    res.status(500).send("Error signing up");
  }
});
passport.use(
  new LocalStrategy(async (username, password, done) => {
    try {
      const user = await prisma.user.findUnique({ where: { username } });
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }

      //Compare passwords
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return done(null, false, { message: 'Incorrect password.' });
      }

      // success
      return done(null, user);
    } catch (err) {
      return done(err);
    }
  })
);
app.post("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) return next(err);
    res.redirect("/");
  });
});

passport.serializeUser((user, done) => {
  done(null, user.id);
});
passport.deserializeUser(async (id, done) => {
  try {
    const user = await prisma.user.findUnique({ where: { id } });
    done(null, user);
  } catch (err) {
    done(err);
  }
});
app.post(
  "/sign-in",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
  })
);
//Uploads the file from the upload page
app.post("/upload", upload.array("uploaded_files"), async (req, res) => {
  if (!req.user) return res.redirect("/login");
  try {
    console.log("BODY:", req.body);
    console.log("FILES:", req.files);

    // Use a fallback {} so destructuring doesn’t crash if req.body is undefined
    const { name, password } = req.body || {};
    const folder = await prisma.folder.create({
      data: {
        name,
        password,
        ownerId: req.user.id,
      },
    });
    const folderDir = path.join("uploads", `folder-${folder.id}`);
    await fs.promises.mkdir(folderDir, { recursive: true });
    for (const file of req.files) {
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const destPath = path.join(folderDir, safeOriginal);

  await fs.promises.rename(file.path, destPath);
}
    res.redirect("/");
  } catch (err) {
    console.error("Upload error:", err);
    res.redirect("/");
  }
});
//Dynamically creates each folder page
app.get("/folder/:id", async (req, res) => {
  const folderId = parseInt(req.params.id, 10);

  const folder = await prisma.folder.findUnique({
    where: { id: folderId },
    include: { owner: true}
  });

  if (!folder) return console.log('Folder not found')

  const folderDir = path.join(__dirname, "uploads", `folder-${folderId}`);

  let files = [];
  try {
    files = await fs.promises.readdir(folderDir); // <-- array of filenames
  } catch (err) {
    files = [];
  }

  res.render("folderPage", { folder, files });
});


//Folder CRUD logic
app.post("/folder/:id/delete", async (req, res) => {
 if(!req.user) return res.redirect("/login");
 const folderId = parseInt(req.params.id, 10)

 const folder = await prisma.folder.findUnique({
  where: { id: folderId},
 });

  if(!folder){return res.redirect("/");}
  if(folder.ownerId !== req.user.id){return res.status(403).send("Not allowed")}
  await prisma.folder.delete({
  where: { id: folderId },
  });
  res.redirect("/")
});




//Runs in terminal and starts site
app.listen(port, () => {
  console.log(`Example app listening on port ${port}.  Visit http://localhost:3000/`)
})

