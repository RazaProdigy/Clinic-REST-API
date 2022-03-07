const mongoose = require('mongoose')
const Schema = mongoose.Schema

const UserSchema = new Schema({
    firstName: String,
    lastName: String,
    email: String,
    password: String,
    role: String,
    verificationToken: String,
    createdAt: Date,
    specialty: String,
});
const appointmentSchema = new Schema({
    patientId: String,
    doctorId: String,
    startTime: Date,
    endTime: Date,
    createdAt: Date,
    note: String,
    status:String
});


module.exports = {
    user: mongoose.model('user', UserSchema),
    appointment: mongoose.model('appointment', appointmentSchema)
}