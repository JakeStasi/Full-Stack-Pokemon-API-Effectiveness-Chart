import express from "express";
import bodyParser from "body-parser";
import pg from "pg";

const app = express();
const port = 3000;



const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "world",
  password: password,
  port: 5432,
});
db.connect();




app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

async function getCurrentPokemon(name){
    const api_url = `https://pokeapi.co/api/v2/pokemon/${name}`

    const result = await fetch(api_url)
    
    const response = await result.json()
    return response
}

async function renderPage(res,error_message){
    const result = await db.query("SELECT * FROM pokemon")
    res.render("index.ejs",{ pokemonList : result.rows, error : error_message})
}

app.get("/", async (req,res) => {
    const result = await db.query("SELECT * FROM pokemon")
    const pokemon_data = result.rows

    res.render("index.ejs", {pokemonList : pokemon_data, error : null})

})

app.post("/add", async (req,res)=>{
    try{
    // Get the name of the pokemon the user is trying to enter
    const currentPokemon = req.body.pokemonName.toLowerCase()

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
    const alreadyExist = await db.query("SELECT * from pokemon where name = $1",[
        currentPokemon
    ])
    if (alreadyExist.rows.length > 0 ){
        return await renderPage(res,"That Pokemon Already exists In Your List!")   
    }

    // Insert the data of the pokemon into the database
    await db.query("INSERT INTO pokemon(name,image_url,description,type,ability,strengths) VALUES ($1,$2,$3,$4,$5,$6)",[
        currentPokemon, img, description, type, ability, strength 
    ])
    res.redirect("/")
    }catch(err){
        return await renderPage(res,"That Pokemon doesn't exist! Try Again")
    }
})

app.post("/delete", async (req,res)=>{
    const id = req.body.pokemonId
    await db.query("DELETE FROM pokemon where id = $1",[
        id
    ])
    res.redirect("/")
})


app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
