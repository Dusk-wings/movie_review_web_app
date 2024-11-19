import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import env from "dotenv";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import session from "express-session";
import passport from "passport";
import bcrypt from "bcrypt";
import { Strategy } from "passport-local";
import methodOverride from "method-override";

const app = express();
const port = 3000;

env.config();

const db = new pg.Client({
  user: process.env.PG_USER,
  password: process.env.PG_PASSWORD,
  database: process.env.PG_DATABASE,
  host: process.env.PG_HOST,
  port: process.env.PG_PORT,
});
db.connect();

app.use(
  session({
    secret: process.env.SECESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);
const __dirname_ = dirname(fileURLToPath(import.meta.url));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname_, "public")));
app.use(methodOverride("_method"));
app.use(passport.initialize());
app.use(passport.session());

let books = [
  {
    book_title: "Dolphin in the Deep",
    title: "Really nice book , must read",
    genres: "Fantasy",
    Identity: "isbn",
    value: 9781444912388,
    image: "",
    Rating: 4,
    review: `“Dolphin in the Deep” raises important animal welfare issues while taking readers on a holiday adventure in Florida. The story highlights the emotional connection between Mandy and the dolphins, Bob and Bing. Lucy Daniels (also known as Ben M. Baglio) skillfully weaves a tale that teaches young readers to treat animals with kindness and empathy. The series as a whole delivers an awesome message, encouraging respect for our fellow creatures.

While the Animal Ark books can be read out of order, each one offers a stand-alone adventure. As an adult revisiting these childhood favorites, I appreciate the enduring impact they had on instilling love and care for animals. Overall, “Dolphin in the Deep” is a well-written and meaningful addition to the series.

Remember, even though it’s aimed at middle-grade readers, the themes resonate with all ages. So, if you’re a dolphin enthusiast or simply enjoy heartwarming stories, give this book a swim!`,
    date: new Date(),
  },
];

async function getImageURL(identity, value) {
  let imageUrl = "";
  try {
    let identity_type = identity.toString().toLowerCase().trim();
    const getImage = await axios.get(
      `https://covers.openlibrary.org/b/${identity_type}/${value}.json`
    );
    const url = getImage.data.source_url;
    imageUrl = url;
  } catch (error) {
    console.log("Error in fetching cover image : " + error);
    imageUrl = "http://localhost:3000/images/Designer.png";
    // console.log(imageUrl);
  }
  return imageUrl;
}

app.get("/", async (req, res) => {
  // console.log(path.join(__dirname_, "public", "images", "Designer.png"));
  // console.log(req.isAuthenticated());
  if (req.isAuthenticated()) {
    const userId = req.user.id;
    try {
      const result = await db.query(
        "SELECT book_reviews.id, userbase.id as userID, book_title, review_title, genres, identity_type, value, review, rating, username, date, imageurl FROM book_reviews JOIN userbase ON book_reviews.user_id = userbase.id ORDER BY id DESC;"
      );
      // console.log(result.rows);
      let review_paragraph = [];
      books = result.rows;
      for (let index = 0; index < books.length; index++) {
        if (books[index].userid == userId) {
          books[index].isAllowed = true;
        } else {
          books[index].isAllowed = false;
        }

        if (books[index].imageurl != "/images/Designer.png") {
          console.log("image-exist");
        } else {
          books[index].imageUrl = getImageURL(
            books[index].identity_type,
            books[index].value
          );
        }

        review_paragraph = books[index].review.split(/\r?\n/);
        books[index].review = review_paragraph;
      }
      res.render("index.ejs", {
        books: books,
        isAuth: true,
      });
    } catch (error) {
      res.render("index.ejs", { isAuth: true });
    }
  } else {
    res.render(__dirname_ + "/views/auth/register.ejs");
  }
});

app.get("/account", async (req, res) => {
  if (req.isAuthenticated()) {
    const user_id = req.user.id;
    const userDetails = req.user;
    try {
      const result = await db.query(
        "SELECT * FROM book_reviews WHERE user_id = $1",
        [user_id]
      );
      if (result.rows.length > 0) {
        const data  = result.rows;
        for (let index = 0; index < data.length; index++) {
          let review_paragraph = data[index].review.split(/\r?\n/);
          data[index].review = review_paragraph;
        }
        res.render("account.ejs", { books : data , user : userDetails, isAuth : true});
      } else {
        res.render("account.ejs", {isAuth : true, user : userDetails});
      }
    } catch (error) {
      console.log("Unable to find the user" + error);
      res.redirect("/");
    }
  } else {
    console.log("User is not Authenticated");
    res.redirect("/");
  }
});

app.get("/login", (req, res) => {
  res.render(__dirname_ + "/views/auth/login.ejs");
});

app.get("/homepage", async (req, res) => {
  res.redirect("/");
});

app.get("/post", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("post.ejs");
  } else {
    res.redirect("/");
  }
});

app.post("/edit", async (req, res) => {
  // console.log(req.user);
  const id = req.body.reviewID;
  if (req.isAuthenticated()) {
    try {
      const result = await db.query(
        "SELECT * FROM book_reviews WHERE id = $1",
        [id]
      );
      const data = result.rows[0];
      console.log(data);
      res.render("edit.ejs", { data: data });
    } catch (error) {
      console.log(error);
      res.render("edit.ejs");
    }
  } else {
    console.error("User is not authenticated.");
    res.redirect("/");
  }
});

app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      console.log(err);
      // res.redirect('/');
    }
    res.redirect("/");
  });
});

app.post("/add", async (req, res) => {
  console.log(req.user);
  if (req.isAuthenticated()) {
    const { book_title, title, genres, identity, value, rating, review } =
      req.body;
    console.log(rating);
    const imageUrl = getImageURL(identity, value);
    try {
      const date = new Date();
      await db.query(
        "INSERT INTO book_reviews (user_id, book_title , review_title , genres, identity_type, value, review , rating, date, imageurl) VALUES ($1, $2, $3, $4, $5, $6, $7 , $8, $9, $10)",
        [
          req.user.id,
          book_title,
          title,
          genres,
          identity,
          value,
          review,
          rating,
          date,
          imageUrl,
        ]
      );
      res.redirect("/");
    } catch (error) {
      console.error("Error while posting query : " + error);
      res.render("post.ejs", {
        error: "There is a problem on our sever , Please try again latter",
      });
    }
  } else {
    res.status(404).send("User not authenticated");
  }
});

app.post("/alter", async (req, res) => {
  if (req.isAuthenticated()) {
    const { book_title, title, genres, identity, value, rating, review } =
      req.body;
    const id = req.body.editId;
    const date = new Date();
    try {
      const result = await db.query(
        "SELECT identity_type, value from book_reviews"
      );
      if (
        value != result.rows[0].value ||
        identity != result.rows[0].identity_type
      ) {
        let url = getImageURL(identity, value);
        await db.query(
          "UPDATE book_reviews SET book_title = $1, review_title = $2, genres = $3, identity_type = $4, value = $5, rating = $6 , review = $7, date = $8, imageurl = $9 WHERE id = $10",
          [
            book_title,
            title,
            genres,
            identity,
            value,
            rating,
            review,
            date,
            url,
            id,
          ]
        );
      } else {
        await db.query(
          "UPDATE book_reviews SET book_title = $1, review_title = $2, genres = $3, identity_type = $4, value = $5, rating = $6 , review = $7, date = $8 WHERE id = $9",
          [book_title, title, genres, identity, value, rating, review, date, id]
        );
      }

      res.redirect("/");
    } catch (error) {
      console.error("Error in the server" + error);
      res.render("edit.ejs", {
        error:
          "There is a problem while updating your post in our Servers, Please try again latter.",
      });
    }
  } else {
    console.error("User not Authenticated.");
    res.redirect("/");
  }
});

app.post("/DELETE", async (req, res) => {
  const id = parseInt(req.body.deleteID);
  if (req.isAuthenticated()) {
    try {
      await db.query("DELETE FROM book_reviews WHERE id = $1", [id]);
      res.redirect("/");
    } catch (error) {
      console.error("Error while deleting the post : " + error);
      res.redirect("/");
    }
  } else {
    res.redirect('/')
  }
});

app.post("/signup", async (req, res) => {
  const username = req.body.userProfileName;
  const email = req.body.username;
  const password = req.body.password;
  try {
    bcrypt.hash(
      password,
      parseInt(process.env.SALT_ROUND),
      async (err, hash) => {
        if (err) {
          console.log(err);
          res.redirect("/");
        } else {
          const result = await db.query(
            "INSERT INTO userbase (username , email , password) VALUES ($1 , $2 , $3) RETURNING id, username , email",
            [username, email, hash]
          );
          const user = result.rows[0];
          req.login(user, (err) => {
            if (err) {
              res.redirect("/");
            } else {
              console.log("Registration succesful");
              res.redirect("/homepage");
            }
          });
        }
      }
    );
  } catch (error) {
    console.log(error);
    res.redirect("/");
  }
});

app.post(
  "/signin",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
  })
);

// app.post("/signin", (req, res) => {
//   passport.authenticate("local", (err, user, message) => {
//     console.log(user);
//     if (err) {
//       res.render(__dirname_ + "/views/auth/login.ejs", { info: message.info });
//     } else {
//       if (!user) {
//         // console.log(me);
//         res.render(__dirname_ + "/views/auth/login.ejs", {
//           info: message.info,
//         });
//       } else {
//         res.redirect("/");
//       }
//     }
//   })(req, res);
// });

passport.use(
  "local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM userbase WHERE email = $1", [
        username,
      ]);
      const user = result.rows[0];
      if (result.rows.length > 0) {
        const savedPassword = result.rows[0].password;
        bcrypt.compare(password, savedPassword, (err, result) => {
          if (err) {
            console.log(err);
            cb(err);
          } else {
            if (result) {
              delete user.password;
              cb(null, user);
            } else {
              cb(null, false, {
                info: "Given Credential doe't match, Please Try Again.",
              });
            }
          }
        });
      } else {
        cb(null, false, {
          info: "Your Email is not in our Database, Please Register youself",
        });
      }
    } catch (err) {
      console.log("Internal database error : \n" + err);
      cb(err, false, {
        info: "There is a fault on our side, Please Try again later.",
      });
    }
  })
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log("listening at : http://localhost:" + port);
});
