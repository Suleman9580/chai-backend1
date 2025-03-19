import { asyncHandler } from "../utils/asyncHandler.js"
import { ApiError } from "../utils/ApiError.js"
import { User } from "../models/user.models.js"
import { uploadOnCoudinary } from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js"


const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToke()
        const refreshToken = user.generateRefreshToken()
        user.refreshToken = refreshToken
        // user.accessToken = accessToken
        await user.save({validateBeforeSave: false})

        return {accessToken, refreshToken}


    } catch (error) {
        throw new ApiError(500, "Error while generating refresh and access tokens")
    }

}



const registerUser = asyncHandler( async (req, res) => {
    
    // get user detail from frontend
    const {fullName, username, email, password} = req.body
    // console.log(email)

    // validation - not empty
    if(
          [fullName, email, username, password].some((field) => 
            field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required")
    }

    // check if user already exists: username or email
   const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })
    if(existedUser) {
        throw new ApiError(409, "User With email or username already exists")
    }

    // check for avatar 
    const avatarLocalPath = req.files?.avatar[0]?.path
    if(!avatarLocalPath) throw new ApiError(400, "Avatar local image is required")
        // check for images
    // const coverImageLocalPath = req.files?.coverImage[0]?.path

    let coverImageLocalPath;
    if(req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0){
        coverImageLocalPath = req.files.coverImage[0].path
    }

    
    console.log(avatarLocalPath)
    
    // upload them to cloudinary
    const avatar = await uploadOnCoudinary(avatarLocalPath)
    const coverImage = await uploadOnCoudinary(coverImageLocalPath)

    if(!avatar) {
        throw new ApiError(400, "Avatar image is required")
    }

    // create user object - create entry in db
    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email,
        password,
        username: username.toLowerCase()
    })

    // remove password and refresh token field from response
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken "
    )

    // check for user creation
    if(!createdUser) throw new ApiError(500, "Something went wrong while creating the user")

    // return res 
    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered successsfully")
    )

})

const loginUser = asyncHandler( async (req, res) => {
    // req.body -> data
    const {email, username, password} = req.body


    ///username email present or not
    if(!username && !email){
        throw new ApiError(400, "Username or email is required")
    }

    // find the user
    const user = await User.findOne({
        $or: [{username}, {email}]
    })
    if(!user) throw new ApiError(404, "User doesn't exists")

    // password check
    const isPasswordValid = await user.isPasswordCorrect(password)
    if(!isPasswordValid) throw new ApiError(401, "Incorrect Password")

    //access and refresh token 
    const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

    //send cookies
    const loggedInUser = await User.findById(user._id).select("-password -refreshToken")
    const options = {
        httpOnly: true,
        secure: true
    }
    return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
        new ApiResponse(
            200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User Logged in successfully"
        )
    )

})

const logoutUser = asyncHandler( async (req, res) => {
    await User.findByIdAndUpdate(
        req.user._id,
        {
            $set: {
                refreshToken: undefined
            }
        },
            {
                new: true
        }
        
    )
    const options = {
        httpOnly: true,
        secure: true
    }

    return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User Log out successfully"))
    
})


export {
    registerUser,
    loginUser,
    logoutUser
}