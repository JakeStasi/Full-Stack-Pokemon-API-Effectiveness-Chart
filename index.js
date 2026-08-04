import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import passport from "passport";
import session from "express-session";
import { Strategy } from "passport-local";
import "dotenv/config";
import pgSession from "connect-pg-simple";

const app = express();
const port = Number(process.env.PORT || 3000);
const saltRounds = 5;
const isProduction = process.env.NODE_ENV === "production";


const db = new pg.Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.INSTANCE_UNIX_SOCKET ||
  process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  max: Number(process.env.DB_POOL_MAX || 5),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});


db.on("error", (error) => {
  console.error("Unexpected PostgreSQL pool error:", error);
});





app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

const PgSessionStore = pgSession(session);

if (isProduction) {
  app.set("trust proxy", 1);
}


app.use(
  session({
    store: new PgSessionStore({
      pool: db,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());


async function getCurrentPokemon(name){
    const api_url = `https://pokeapi.co/api/v2/pokemon/${name}`

    const result = await fetch(api_url)
    
    const response = await result.json()
    return response
}

async function renderPage(req,res,error_message){
    const result = await db.query("SELECT * FROM pokemon WHERE user_id = $1 ORDER BY id DESC",[
        req.user.id
    ])
    res.render("index.ejs",{ pokemonList : result.rows, error : error_message, user: req.user})
}

function requireAuth(req, res, next) {
  if (req.isAuthenticated()) {
    return next();
  }

  res.redirect("/login");
}

app.get("/", async (req,res) => {
    if (req.isAuthenticated()){
        const result = await db.query("SELECT * FROM pokemon where user_id = $1 ORDER BY id DESC",[
            req.user.id
        ])
        
        

        res.render("index.ejs", {pokemonList : result.rows, error : null, user: req.user})
    }else{
        res.redirect("/login")
    }

})

app.post("/logout",(req,res,next)=>{
    req.logout((err)=>{
        if (err){
            return next(err);
        }

        res.redirect("/home")
    })
})
app.get("/home", (req, res) => {
  res.render("home.ejs");
});


app.get("/login", async (req,res)=>{
    res.render("login.ejs", {error: null})
})

app.post("/login", (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      return next(err);
    }

    if (!user) {
      return res.status(401).render("login.ejs", {
        error: info?.message || "Invalid email or password",
      });
    }

    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }

      return res.redirect("/");
    });
  })(req, res, next);
});

app.get("/register", async (req,res)=>{
    res.render("register.ejs", {error: null})
})

app.post("/register", async (req,res)=>{
    const password = req.body.password
    const username = req.body.username.trim().toLowerCase();

    try {
        const check = await db.query("SELECT * FROM users where email = $1",[
            username
        ]);

        if (check.rows.length > 0){
            return res.render("register.ejs",{error:"Email Already Exists"})
        }else{

            const hash = await bcrypt.hash(password, saltRounds)
            await db.query("INSERT INTO users (email,password) VALUES ($1,$2)",[
                    username, hash
                ])
            
            res.redirect("/home")
        }
    }catch(err){
        return res.render("register.ejs",{error:"Unable to create your account. Please Try Again!"})
    }
})


app.post("/add", requireAuth, async (req,res)=>{
    try{
    // Get the name of the pokemon the user is trying to enter
    const currentPokemon = req.body.pokemonName.trim().toLowerCase()

    // Get the data for the description of the pokemon using this API
    const url = `https://pokeapi.co/api/v2/pokemon-species/${currentPokemon}`;
    const desc = await fetch(url);
    const data = await desc.json();
    const eng = data.flavor_text_entries.find((entry) => {
        return entry.language.name === "en";
    });
    const description = eng.flavor_text.replace(/\n|\f/g, " ");

    // Get the rest of the data from the other API with helper function
    const result = await getCurrentPokemon(currentPokemon)
    const img = result.sprites.front_default
    const ability = result.abilities[0].ability.name

    // Get the data of the pokemon type
    const types = result.types.map((item) => item.type.name)
    const type = types.join(" ")
    let allStrengths = [];
    for (const x of types){
        const str = await fetch(`https://pokeapi.co/api/v2/type/${x}`)
        const s = await str.json()
        const strengths = s.damage_relations.double_damage_to.map(
            (item => item.name)
        )
        allStrengths.push(...strengths)
    }
    const strength = [...new Set(allStrengths)].join(", ")

    // Check if the pokemon already exists in the list
    const alreadyExist = await db.query("SELECT * from pokemon where name = $1 AND user_id = $2",[
        currentPokemon, req.user.id
    ])
    if (alreadyExist.rows.length > 0 ){
        return await renderPage(req,res,"That Pokemon Already exists In Your List!")   
    }

    // Insert the data of the pokemon into the database
    await db.query("INSERT INTO pokemon(name,image_url,description,type,ability,strengths,user_id) VALUES ($1,$2,$3,$4,$5,$6,$7)",[
        currentPokemon, img, description, type, ability, strength, req.user.id 
    ])
    res.redirect("/")
    }catch(err){
        return await renderPage(req,res,"That Pokemon doesn't exist! Try Again")
    }
})

app.post("/delete", requireAuth, async (req,res)=>{
    const id = req.body.pokemonId
    await db.query("DELETE FROM pokemon where id = $1 AND user_id = $2",[
        id,req.user.id
    ])
    res.redirect("/")
})

passport.use(
  new Strategy(async function verify(username, password, cb) {
    try {
      const email = username.trim().toLowerCase();

      const check = await db.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
      );

      if (check.rows.length === 0) {
        return cb(null, false, {
          message: "User does not exist",
        });
      }

      const user = check.rows[0];
      const passwordMatches = await bcrypt.compare(
        password,
        user.password
      );

      if (!passwordMatches) {
        return cb(null, false, {
          message: "Incorrect password",
        });
      }

      return cb(null, user);
    } catch (err) {
      return cb(err);
    }
  })
);

passport.serializeUser((user,cb)=>{
  cb(null,user.id)
})

passport.deserializeUser(async (id, cb) => {
  try {
    const result = await db.query(
      "SELECT id, email FROM users WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return cb(null, false);
    }

    return cb(null, result.rows[0]);
  } catch (err) {
    return cb(err);
  }
});




app.listen(port, "0.0.0.0", () => {
  console.log(`Server running on port ${port}`);
});