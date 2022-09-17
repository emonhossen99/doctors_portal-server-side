const express = require('express');
const app = express()
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');
const port = process.env.PORT || 5000;
const jwt = require('jsonwebtoken');
const cors = require('cors');

// middleWare
app.use(cors())
app.use(express.json())



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.no7tlsb.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect()
        const serviceCollection = client.db("doctor-portal").collection("services")
        const bookingCollection = client.db("doctor-portal").collection("bookings")
        const userCollection = client.db("doctor-portal").collection("users")


        app.get('/services', async (req, res) => {
            const query = {}
            const cursor = serviceCollection.find(query)
            const result = await cursor.toArray()
            res.send(result)

        })

        app.get('/available', async(req,res) =>{
            const date = req.query.date 
         
            //step 1 :  all services collection get and convert to array
            const services = await serviceCollection.find().toArray
            ()
            //step 2 :  only single day bookings on this user 
            const query = {date : date}
            const booking = await bookingCollection.find(query).toArray()
            
            //step 3 : step  1 - step 2 
            services.forEach(service => {
                const servicesBookings = booking.filter(b => b.treatment === service.name)
                const booked = servicesBookings.map(s => s.slot)
                const available = service.slots.filter(s => !booked.includes(s))
                service.slots = available;
            })
            res.send(services)
        })

        app.put('/user/:email', async(req,res) => {
            const email = req.params.email
            const user = req.body
            const filter = {email : email}
            const option = { upsert : true}
            const updateDoc = {
                $set : user,
            }
            const result = await userCollection.updateOne(filter,updateDoc,option)
            res.send(result)
        })

        app.get('/booking',async(req,res) =>{
            const patient = req.query.patient;
            const query = {patient : patient}
            const bookings = await bookingCollection.find(query).toArray()
            res.send(bookings)
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query)
            if(exists){
                return res.send({success : false , booking: exists})
            }
            const result = await bookingCollection.insertOne(booking)
            res.send( { success : true ,result})
        })
    }
    finally {

    }
}
run().catch(console.dir)



app.get('/', (req, res) => {
    res.send('server is running')
})

app.listen(port, () => {
    console.log(port);
})